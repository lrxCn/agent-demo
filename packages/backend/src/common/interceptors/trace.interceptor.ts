import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';

import {
  TraceContext,
  generateBackendTraceId,
  parseTraceparent,
} from '../context/trace-context';

@Injectable()
export class TraceInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TraceInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // 仅处理 HTTP 请求；WebSocket / GraphQL 等不在 v1 范围
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const req = context.switchToHttp().getRequest<Request>();
    const headerValue = req.headers['traceparent'];
    let traceId = parseTraceparent(headerValue);
    let origin: 'frontend' | 'backend' = 'frontend';
    if (!traceId) {
      traceId = generateBackendTraceId();
      origin = 'backend';
      this.logger.debug(
        `traceparent 缺失，fallback 生成 trace_id=${traceId} path=${req.method} ${req.url}`,
      );
    }
    return new Observable((subscriber) => {
      TraceContext.run({ traceId, traceOrigin: origin }, () => {
        next.handle().subscribe({
          next: (v) => subscriber.next(v),
          error: (e: unknown) => subscriber.error(e),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
