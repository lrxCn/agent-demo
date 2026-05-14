import * as crypto from 'crypto';
import * as readline from 'readline';

import { HttpService } from '@nestjs/axios';
import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import type { Readable } from 'stream';

import { JwtUser } from '../auth/types/jwt-user.types';
import { TraceContext } from '../common/context/trace-context';
import { AppGateway } from '../common/gateways/app.gateway';
import { UserFrontendToolsService } from '../common/gateways/user-frontend-tools.service';
import { ChatDto } from './dto/chat.dto';

/** 下发给前端的 SSE 业务负载（与 API_CONTRACTS 对齐，含 trace / error 便于排错） */
export type AgentChatStreamPayload =
  | { type: 'token'; content: string }
  | { type: 'tool_call'; tool: string; params: Record<string, unknown> }
  | { type: 'done'; content: string; thread_id: string }
  | { type: 'error'; message: string }
  | { type: 'trace'; trace_id: string; langsmith_run_id: string };

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
    private readonly gateway: AppGateway,
  ) {}

  /** WebSocket 缓存与请求体中的工具名合并（去重），供 LangGraph 注入前端工具 */
  private mergeAvailableFrontendTools(
    userId: string,
    dtoTools: string[] | undefined,
  ): string[] {
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
        this.http.post<LangGraphThreadCreateResponse>(
          `${base}/threads`,
          {},
          { timeout: 30_000 },
        ),
      );
      if (!data?.thread_id) {
        throw new BadGatewayException(
          'LangGraph 创建 thread 响应缺少 thread_id',
        );
      }
      return data.thread_id;
    } catch (err) {
      this.logAxiosError('createThread', err);
      throw err instanceof BadGatewayException
        ? err
        : new BadGatewayException('创建对话 thread 失败');
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
    const mergedTools = this.mergeAvailableFrontendTools(
      user.id,
      dto.available_tools,
    );
    const traceId = TraceContext.getTraceId();
    this.logger.log(
      JSON.stringify({
        trace_id: traceId,
        user_id: user.id,
        thread_id: threadId,
        module: 'agent',
        level: 'info',
        msg: 'streamChat 开始',
        extra: {
          message_len: dto.message.length,
          available_tools_count: mergedTools.length,
        },
      }),
    );
    const available = new Set(mergedTools);
    const emittedToolKeys = new Set<string>();
    let accumulatedText = '';

    const input = {
      messages: [{ role: 'user', content: dto.message }],
      mem0_user_id: user.id,
      thread_id: threadId,
      available_frontend_tools: mergedTools,
      user_role_ids: user.roleIds,
      // 监控体系：把 W3C trace_id 传给 Agent 用于 LangSmith metadata
      app_trace_id: traceId,
    };

    const body = {
      assistant_id: 'agent',
      input,
      stream_mode: ['messages-tuple', 'updates', 'metadata'],
    };

    const res = await this.http.axiosRef.post<Readable>(
      `${base}/threads/${threadId}/runs/stream`,
      body,
      {
        responseType: 'stream',
        validateStatus: () => true,
        timeout: 0,
        headers: { 'Content-Type': 'application/json' },
      },
    );

    if (res.status < 200 || res.status >= 300) {
      const errText = await this.readStreamAsText(res.data);
      throw new BadGatewayException(
        `LangGraph 流式调用失败 (${res.status}): ${errText}`,
      );
    }

    const stream = res.data;
    /** 收集 updates 模式下的完整前端工具调用（覆盖策略，保证 params 完整） */
    const wsToolCalls = new Map<
      string,
      { tool: string; params: Record<string, unknown> }
    >();
    let traceEventEmitted = false;
    const appTraceId = traceId;
    try {
      for await (const evt of this.parseSse(stream)) {
        // 监控体系：从 LangGraph metadata 事件中提取 run_id，第一时间下发 trace 事件
        if (!traceEventEmitted) {
          const runId = this.extractRunIdFromMetadata(evt);
          if (runId) {
            traceEventEmitted = true;
            yield {
              type: 'trace',
              trace_id: appTraceId,
              langsmith_run_id: runId,
            };
          }
        }
        for (const out of this.mapLangGraphEvent(
          evt,
          available,
          emittedToolKeys,
        )) {
          if (out.type === 'token' && out.content) {
            accumulatedText += out.content;
          }
          yield out;
        }
        // 从原始 SSE 事件中额外提取 updates 模式的完整 tool_calls（不受 emittedToolKeys 限制）
        this.collectUpdatesToolCalls(evt, available, wsToolCalls);
      }
    } finally {
      stream.destroy();
    }

    // 流结束后，推送完整的前端工具调用
    for (const tc of wsToolCalls.values()) {
      this.pushToolInvoke(user.id, tc.tool, tc.params);
    }

    yield { type: 'done', content: accumulatedText, thread_id: threadId };
  }

  /** 对外统一入口：无 thread 时先创建 */
  async *chatStream(
    user: JwtUser,
    dto: ChatDto,
  ): AsyncGenerator<AgentChatStreamPayload, void, undefined> {
    const threadId = dto.thread_id?.trim()
      ? dto.thread_id
      : await this.createThread();
    yield* this.streamChat(threadId, dto, user);
  }

  /** 通过 WebSocket 向前端推送 tool:invoke 事件 */
  private pushToolInvoke(
    userId: string,
    tool: string,
    params: Record<string, unknown>,
  ): void {
    const socket = this.gateway.getSocketByUserId(userId);
    if (!socket) {
      this.logger.warn(`tool:invoke 推送失败：用户 ${userId} 无在线 WebSocket`);
      return;
    }
    const invokeId = crypto.randomUUID();
    socket.emit('tool:invoke', { id: invokeId, tool, params });
    this.logger.debug(
      `tool:invoke 已推送 userId=${userId} tool=${tool} id=${invokeId}`,
    );
  }

  /**
   * 从 SSE 原始事件中提取 updates 模式下的完整 tool_calls。
   * 不受 emittedToolKeys 去重限制，保证 WebSocket 推送拿到完整 params。
   * 使用覆盖策略：同名工具后来者覆盖前者。
   */
  private collectUpdatesToolCalls(
    evt: { event: string; data: string },
    availableTools: Set<string>,
    target: Map<string, { tool: string; params: Record<string, unknown> }>,
  ): void {
    const raw = evt.data.trim();
    if (!raw || raw === '[DONE]') {
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return;
    }
    // 多 stream_mode 格式：["updates", { chat: { messages: [...] } }]
    let updatesPayload: Record<string, unknown> | undefined;
    if (
      Array.isArray(parsed) &&
      parsed.length >= 2 &&
      parsed[0] === 'updates'
    ) {
      updatesPayload = parsed[1] as Record<string, unknown>;
    } else if (
      evt.event === 'updates' &&
      parsed &&
      typeof parsed === 'object'
    ) {
      updatesPayload = parsed as Record<string, unknown>;
    }
    if (!updatesPayload) {
      return;
    }
    const chatUpdate = updatesPayload.chat as
      | { messages?: unknown[] }
      | undefined;
    if (!chatUpdate?.messages || !Array.isArray(chatUpdate.messages)) {
      return;
    }
    for (const msg of chatUpdate.messages) {
      if (!msg || typeof msg !== 'object') {
        continue;
      }
      const toolCalls = (msg as Record<string, unknown>).tool_calls;
      if (!Array.isArray(toolCalls)) {
        continue;
      }
      for (const tc of toolCalls) {
        if (!tc || typeof tc !== 'object') {
          continue;
        }
        const obj = tc as Record<string, unknown>;
        const name = typeof obj.name === 'string' ? obj.name : '';
        if (!name || !availableTools.has(name)) {
          continue;
        }
        let params: Record<string, unknown> = {};
        if (
          obj.args &&
          typeof obj.args === 'object' &&
          !Array.isArray(obj.args)
        ) {
          params = obj.args as Record<string, unknown>;
        }
        // 只收集有实际参数的 tool_call
        if (Object.keys(params).length > 0) {
          target.set(name, { tool: name, params });
        }
      }
    }
  }

  /**
   * 从 LangGraph SSE `metadata` 流模式中提取顶层 run_id（即 LangSmith run_id）。
   * 失败返回 null。
   */
  private extractRunIdFromMetadata(evt: {
    event: string;
    data: string;
  }): string | null {
    const raw = evt.data.trim();
    if (!raw || raw === '[DONE]') {
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
    // 多 stream_mode 格式：["metadata", { run_id: "...", ... }]
    let payload: Record<string, unknown> | undefined;
    if (
      Array.isArray(parsed) &&
      parsed.length >= 2 &&
      parsed[0] === 'metadata' &&
      parsed[1] &&
      typeof parsed[1] === 'object'
    ) {
      payload = parsed[1] as Record<string, unknown>;
    } else if (
      evt.event === 'metadata' &&
      parsed &&
      typeof parsed === 'object'
    ) {
      payload = parsed as Record<string, unknown>;
    }
    if (!payload) {
      return null;
    }
    const runId =
      typeof payload.run_id === 'string'
        ? payload.run_id
        : typeof (payload as { id?: unknown }).id === 'string'
        ? ((payload as { id?: unknown }).id as string)
        : '';
    return runId || null;
  }

  private async *parseSse(
    readable: Readable,
  ): AsyncGenerator<{ event: string; data: string }, void, undefined> {
    const rl = readline.createInterface({
      input: readable,
      crlfDelay: Infinity,
    });
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
    if (
      Array.isArray(parsed) &&
      parsed.length >= 2 &&
      typeof parsed[0] === 'string'
    ) {
      const mode = parsed[0];
      const payload = parsed[1];
      if (mode === 'messages-tuple' || mode === 'messages') {
        yield* this.extractFromMessagesTuple(
          payload,
          availableTools,
          emittedToolKeys,
        );
      } else if (mode === 'updates') {
        yield* this.extractFromUpdates(
          payload,
          availableTools,
          emittedToolKeys,
        );
      }
      return;
    }

    if (evt.event === 'messages' || evt.event === 'messages-tuple') {
      yield* this.extractFromMessagesTuple(
        parsed,
        availableTools,
        emittedToolKeys,
      );
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
    if (
      Array.isArray(payload) &&
      payload.length >= 1 &&
      payload[0] &&
      typeof payload[0] === 'object'
    ) {
      msg = payload[0] as Record<string, unknown>;
    } else if (
      payload &&
      typeof payload === 'object' &&
      !Array.isArray(payload)
    ) {
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
    yield* this.emitToolCallsFromMessage(
      last as Record<string, unknown>,
      availableTools,
      emittedToolKeys,
    );
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
      if (
        obj.args &&
        typeof obj.args === 'object' &&
        !Array.isArray(obj.args)
      ) {
        params = obj.args as Record<string, unknown>;
      } else if (obj.function && typeof obj.function === 'object') {
        const fn = obj.function as { arguments?: unknown };
        if (typeof fn.arguments === 'string') {
          try {
            const parsed = JSON.parse(fn.arguments) as unknown;
            if (
              parsed &&
              typeof parsed === 'object' &&
              !Array.isArray(parsed)
            ) {
              params = parsed as Record<string, unknown>;
            }
          } catch {
            /* 流式片段可能不完整，跳过 */
          }
        }
      }
      // OpenAI 流式 arguments 可能尚未拼完，避免重复下发不完整 params
      if (
        obj.function &&
        typeof obj.function === 'object' &&
        Object.keys(params).length === 0
      ) {
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
      const chunks: string[] = [];
      stream.on('data', (c: Buffer | string) => {
        chunks.push(typeof c === 'string' ? c : c.toString('utf8'));
      });
      stream.on('end', () => resolve(chunks.join('').slice(0, 2000)));
      stream.on('error', reject);
    });
  }

  private logAxiosError(context: string, err: unknown): void {
    if (typeof err === 'object' && err !== null && 'response' in err) {
      const r = err as { response?: { status?: number; data?: unknown } };
      this.logger.error(
        `${context} 失败 status=${r.response?.status} data=${JSON.stringify(
          r.response?.data,
        )}`,
      );
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(`${context} 失败: ${message}`);
  }
}
