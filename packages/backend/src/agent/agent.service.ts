import * as readline from 'readline';

import { HttpService } from '@nestjs/axios';
import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import type { Readable } from 'stream';

import { JwtUser } from '../auth/types/jwt-user.types';
import { UserFrontendToolsService } from '../common/gateways/user-frontend-tools.service';
import { ChatDto } from './dto/chat.dto';

/** 下发给前端的 SSE 业务负载（与 API_CONTRACTS 对齐，含 error 便于排错） */
export type AgentChatStreamPayload =
  | { type: 'token'; content: string }
  | { type: 'tool_call'; tool: string; params: Record<string, unknown> }
  | { type: 'done'; content: string; thread_id: string }
  | { type: 'error'; message: string };

interface LangGraphThreadCreateResponse {
  thread_id: string;
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly userFrontendTools: UserFrontendToolsService,
  ) {}

  /** WebSocket 缓存与请求体中的工具名合并（去重），供 LangGraph 注入前端工具 */
  private mergeAvailableFrontendTools(userId: string, dtoTools: string[] | undefined): string[] {
    const fromWs = this.userFrontendTools.getTools(userId);
    const fromDto = dtoTools ?? [];
    return [...new Set([...fromWs, ...fromDto])];
  }

  private getBaseUrl(): string {
    const raw = this.config.get<string>('LANGGRAPH_API_URL')?.trim();
    if (!raw) {
      throw new BadGatewayException('未配置环境变量 LANGGRAPH_API_URL');
    }
    return raw.replace(/\/+$/, '');
  }

  /** 在 LangGraph Server 创建新 thread */
  async createThread(): Promise<string> {
    const base = this.getBaseUrl();
    try {
      const { data } = await firstValueFrom(
        this.http.post<LangGraphThreadCreateResponse>(`${base}/threads`, {}, { timeout: 30_000 }),
      );
      if (!data?.thread_id) {
        throw new BadGatewayException('LangGraph 创建 thread 响应缺少 thread_id');
      }
      return data.thread_id;
    } catch (err) {
      this.logAxiosError('createThread', err);
      throw err instanceof BadGatewayException ? err : new BadGatewayException('创建对话 thread 失败');
    }
  }

  /**
   * 调用 LangGraph `/runs/stream`，解析 SSE 并映射为前端契约事件。
   * 使用 messages-tuple 流式 token；updates 用于捕获完整 tool_calls（前端工具需出现在 available_tools 中才下发）。
   */
  async *streamChat(
    threadId: string,
    dto: ChatDto,
    user: JwtUser,
  ): AsyncGenerator<AgentChatStreamPayload, void, undefined> {
    const base = this.getBaseUrl();
    const mergedTools = this.mergeAvailableFrontendTools(user.id, dto.available_tools);
    const available = new Set(mergedTools);
    const emittedToolKeys = new Set<string>();
    let accumulatedText = '';

    const input = {
      messages: [{ role: 'user', content: dto.message }],
      mem0_user_id: user.id,
      thread_id: threadId,
      available_frontend_tools: mergedTools,
    };

    const body = {
      assistant_id: 'agent',
      input,
      stream_mode: ['messages-tuple', 'updates'],
    };

    const res = await this.http.axiosRef.post<Readable>(`${base}/threads/${threadId}/runs/stream`, body, {
      responseType: 'stream',
      validateStatus: () => true,
      timeout: 0,
      headers: { 'Content-Type': 'application/json' },
    });

    if (res.status < 200 || res.status >= 300) {
      const errText = await this.readStreamAsText(res.data);
      throw new BadGatewayException(`LangGraph 流式调用失败 (${res.status}): ${errText}`);
    }

    const stream = res.data;
    try {
      for await (const evt of this.parseSse(stream)) {
        for (const out of this.mapLangGraphEvent(evt, available, emittedToolKeys)) {
          if (out.type === 'token' && out.content) {
            accumulatedText += out.content;
          }
          yield out;
        }
      }
    } finally {
      stream.destroy();
    }

    yield { type: 'done', content: accumulatedText, thread_id: threadId };
  }

  /** 对外统一入口：无 thread 时先创建 */
  async *chatStream(user: JwtUser, dto: ChatDto): AsyncGenerator<AgentChatStreamPayload, void, undefined> {
    const threadId = dto.thread_id?.trim() ? dto.thread_id : await this.createThread();
    yield* this.streamChat(threadId, dto, user);
  }

  private async *parseSse(
    readable: Readable,
  ): AsyncGenerator<{ event: string; data: string }, void, undefined> {
    const rl = readline.createInterface({ input: readable, crlfDelay: Infinity });
    let eventName = 'message';
    const dataLines: string[] = [];
    try {
      for await (const line of rl) {
        if (line === '') {
          if (dataLines.length > 0) {
            yield { event: eventName, data: dataLines.join('\n') };
            dataLines.length = 0;
            eventName = 'message';
          }
          continue;
        }
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
          continue;
        }
        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart());
        }
      }
      if (dataLines.length > 0) {
        yield { event: eventName, data: dataLines.join('\n') };
      }
    } finally {
      rl.close();
    }
  }

  private *mapLangGraphEvent(
    evt: { event: string; data: string },
    availableTools: Set<string>,
    emittedToolKeys: Set<string>,
  ): Generator<AgentChatStreamPayload, void, undefined> {
    const raw = evt.data.trim();
    if (!raw || raw === '[DONE]') {
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      this.logger.warn(`跳过无法解析的 SSE 片段: ${raw.slice(0, 200)}`);
      return;
    }

    // 多 stream_mode：["messages-tuple", payload] 或 ["updates", payload]
    if (Array.isArray(parsed) && parsed.length >= 2 && typeof parsed[0] === 'string') {
      const mode = parsed[0];
      const payload = parsed[1];
      if (mode === 'messages-tuple' || mode === 'messages') {
        yield* this.extractFromMessagesTuple(payload, availableTools, emittedToolKeys);
      } else if (mode === 'updates') {
        yield* this.extractFromUpdates(payload, availableTools, emittedToolKeys);
      }
      return;
    }

    if (evt.event === 'messages' || evt.event === 'messages-tuple') {
      yield* this.extractFromMessagesTuple(parsed, availableTools, emittedToolKeys);
      return;
    }
    if (evt.event === 'updates') {
      yield* this.extractFromUpdates(parsed, availableTools, emittedToolKeys);
    }
  }

  private *extractFromMessagesTuple(
    payload: unknown,
    availableTools: Set<string>,
    emittedToolKeys: Set<string>,
  ): Generator<AgentChatStreamPayload, void, undefined> {
    let msg: Record<string, unknown>;
    if (Array.isArray(payload) && payload.length >= 1 && payload[0] && typeof payload[0] === 'object') {
      msg = payload[0] as Record<string, unknown>;
    } else if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      msg = payload as Record<string, unknown>;
    } else {
      return;
    }
    const content = typeof msg.content === 'string' ? msg.content : '';
    if (content) {
      yield { type: 'token', content };
    }
    yield* this.emitToolCallsFromMessage(msg, availableTools, emittedToolKeys);
  }

  private *extractFromUpdates(
    payload: unknown,
    availableTools: Set<string>,
    emittedToolKeys: Set<string>,
  ): Generator<AgentChatStreamPayload, void, undefined> {
    if (!payload || typeof payload !== 'object') {
      return;
    }
    const nodeMap = payload as Record<string, unknown>;
    const chatUpdate = nodeMap.chat;
    if (!chatUpdate || typeof chatUpdate !== 'object') {
      return;
    }
    const messages = (chatUpdate as { messages?: unknown }).messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return;
    }
    const last = messages[messages.length - 1];
    if (!last || typeof last !== 'object') {
      return;
    }
    yield* this.emitToolCallsFromMessage(last as Record<string, unknown>, availableTools, emittedToolKeys);
  }

  private *emitToolCallsFromMessage(
    msg: Record<string, unknown>,
    availableTools: Set<string>,
    emittedToolKeys: Set<string>,
  ): Generator<AgentChatStreamPayload, void, undefined> {
    const toolCalls = msg.tool_calls;
    if (!Array.isArray(toolCalls)) {
      return;
    }
    for (const tc of toolCalls) {
      if (!tc || typeof tc !== 'object') {
        continue;
      }
      const obj = tc as Record<string, unknown>;
      const name = typeof obj.name === 'string' ? obj.name : '';
      const id = typeof obj.id === 'string' ? obj.id : '';
      if (!name || !availableTools.has(name)) {
        continue;
      }
      const key = `${id}:${name}`;
      if (emittedToolKeys.has(key)) {
        continue;
      }
      let params: Record<string, unknown> = {};
      if (obj.args && typeof obj.args === 'object' && !Array.isArray(obj.args)) {
        params = obj.args as Record<string, unknown>;
      } else if (obj.function && typeof obj.function === 'object') {
        const fn = obj.function as { arguments?: unknown };
        if (typeof fn.arguments === 'string') {
          try {
            const parsed = JSON.parse(fn.arguments) as unknown;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              params = parsed as Record<string, unknown>;
            }
          } catch {
            /* 流式片段可能不完整，跳过 */
          }
        }
      }
      // OpenAI 流式 arguments 可能尚未拼完，避免重复下发不完整 params
      if (obj.function && typeof obj.function === 'object' && Object.keys(params).length === 0) {
        const fn = obj.function as { arguments?: unknown };
        if (typeof fn.arguments === 'string' && fn.arguments.trim() === '') {
          continue;
        }
      }
      emittedToolKeys.add(key);
      yield { type: 'tool_call', tool: name, params };
    }
  }

  private async readStreamAsText(stream: Readable): Promise<string> {
    return await new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer | string) => {
        chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
      });
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8').slice(0, 2000)));
      stream.on('error', reject);
    });
  }

  private logAxiosError(context: string, err: unknown): void {
    if (typeof err === 'object' && err !== null && 'response' in err) {
      const r = err as { response?: { status?: number; data?: unknown } };
      this.logger.error(
        `${context} 失败 status=${r.response?.status} data=${JSON.stringify(r.response?.data)}`,
      );
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(`${context} 失败: ${message}`);
  }
}
