import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';

/** 前端通过 WebSocket 回传的工具执行结果（与 API_CONTRACTS 对齐） */
export interface FrontendToolResultPayload {
  id: string;
  success: boolean;
  result?: unknown;
}

/** 供 Agent 或其它模块订阅的完整事件 */
export interface FrontendToolResultEvent extends FrontendToolResultPayload {
  userId: string;
}

/**
 * 内存缓存：当前用户页面注册的可用前端工具名列表。
 * Agent 代理层合并进 `available_frontend_tools`。
 */
@Injectable()
export class UserFrontendToolsService {
  private readonly cache = new Map<string, string[]>();

  setTools(userId: string, tools: string[]): void {
    this.cache.set(userId, [...tools]);
  }

  getTools(userId: string): string[] {
    return this.cache.get(userId) ?? [];
  }

  clearUser(userId: string): void {
    this.cache.delete(userId);
  }
}

/**
 * 前端工具结果总线：Gateway 写入，后续可由 Agent 层订阅并转发 LangGraph（Phase 4 接线）。
 */
@Injectable()
export class FrontendToolResultBus {
  private readonly logger = new Logger(FrontendToolResultBus.name);
  private readonly emitter = new EventEmitter();

  emitToolResult(userId: string, payload: FrontendToolResultPayload): void {
    const evt: FrontendToolResultEvent = { userId, ...payload };
    this.emitter.emit('tool_result', evt);
    this.logger.debug(`收到前端工具结果 userId=${userId} id=${payload.id} success=${payload.success}`);
  }

  onToolResult(handler: (evt: FrontendToolResultEvent) => void): void {
    this.emitter.on('tool_result', handler);
  }

  offToolResult(handler: (evt: FrontendToolResultEvent) => void): void {
    this.emitter.off('tool_result', handler);
  }
}
