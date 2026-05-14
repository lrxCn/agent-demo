import { randomBytes } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * 单次请求级的 trace 上下文。
 * 在 NestJS 全局拦截器（TraceInterceptor）中 `run()`，
 * 后续 Service / DAO 通过 `getTraceId()` 同步取出。
 */
export interface TraceStore {
  /** 32 字符 hex；缺失时由后端 fallback 生成 */
  traceId: string;
  /** 来源：'frontend' = 来自前端 header；'backend' = fallback */
  traceOrigin: 'frontend' | 'backend';
}

const storage = new AsyncLocalStorage<TraceStore>();

export class TraceContext {
  /** 拦截器入口调用，把 store 绑到当前异步链 */
  static run<T>(store: TraceStore, fn: () => T): T {
    return storage.run(store, fn);
  }

  /** Service / DAO 中读 */
  static getStore(): TraceStore | undefined {
    return storage.getStore();
  }

  /** 便捷读 trace_id；上下文外返回空字符串 */
  static getTraceId(): string {
    return storage.getStore()?.traceId ?? '';
  }

  /** 便捷读 origin */
  static getTraceOrigin(): 'frontend' | 'backend' | '' {
    return storage.getStore()?.traceOrigin ?? '';
  }
}

/**
 * 解析 W3C traceparent header（`00-<32hex>-<16hex>-01`）
 * 返回 32 字符 hex trace_id；解析失败返回空字符串
 */
export function parseTraceparent(value: string | string[] | undefined): string {
  if (!value) {
    return '';
  }
  const header = Array.isArray(value) ? value[0] : value;
  if (typeof header !== 'string') {
    return '';
  }
  const parts = header.split('-');
  if (parts.length !== 4 || parts[0] !== '00' || parts[1].length !== 32) {
    return '';
  }
  if (!/^[0-9a-f]{32}$/i.test(parts[1])) {
    return '';
  }
  return parts[1].toLowerCase();
}

/** Fallback 用：生成 32 字符 hex（用 Node 内置 crypto） */
export function generateBackendTraceId(): string {
  return randomBytes(16).toString('hex');
}
