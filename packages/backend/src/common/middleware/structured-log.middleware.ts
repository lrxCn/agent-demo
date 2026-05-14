import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { TraceContext } from '../context/trace-context';

/**
 * HTTP 请求出入日志（JSON 结构化）。
 * 字段约定（与 docs/monitor/4.ARCHITECTURE_FOR_AI.md §2 P4 一致）：
 *   - trace_id / user_id / thread_id / module / level / msg / elapsed_ms / extra
 */
@Injectable()
export class StructuredLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();
    res.on('finish', () => {
      const elapsedMs = Date.now() - start;
      const store = TraceContext.getStore();
      const userId =
        (req as Request & { user?: { id?: string } }).user?.id ?? '';
      const payload = {
        trace_id: store?.traceId ?? '',
        trace_origin: store?.traceOrigin ?? '',
        user_id: userId,
        module: 'http',
        level:
          res.statusCode >= 500
            ? 'error'
            : res.statusCode >= 400
            ? 'warn'
            : 'info',
        msg: `${req.method} ${req.url}`,
        elapsed_ms: elapsedMs,
        extra: {
          status: res.statusCode,
          ua: req.headers['user-agent'] ?? '',
        },
      };
      const line = JSON.stringify(payload);
      if (payload.level === 'error') {
        this.logger.error(line);
      } else if (payload.level === 'warn') {
        this.logger.warn(line);
      } else {
        this.logger.log(line);
      }
    });
    next();
  }
}
