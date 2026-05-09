import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/** 将异常转为统一 JSON：{ code, data: null, message } */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse() as string | Record<string, unknown>;
      const { message, code } = this.parseHttpResponse(raw, status);
      response.status(status).json({
        code,
        data: null,
        message,
      });
      return;
    }

    this.logger.error(
      `未处理异常 ${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: HttpStatus.INTERNAL_SERVER_ERROR,
      data: null,
      message: '服务器内部错误',
    });
  }

  private parseHttpResponse(
    raw: string | Record<string, unknown>,
    fallbackStatus: number,
  ): { message: string; code: number } {
    if (typeof raw === 'string') {
      return { message: raw, code: fallbackStatus };
    }
    const body = raw as Record<string, unknown>;
    const code =
      typeof body.code === 'number' && Number.isFinite(body.code)
        ? body.code
        : fallbackStatus;
    const msg = body.message;
    if (Array.isArray(msg)) {
      return { message: msg.map(String).join('; '), code };
    }
    if (typeof msg === 'string') {
      return { message: msg, code };
    }
    return { message: '请求处理失败', code };
  }
}
