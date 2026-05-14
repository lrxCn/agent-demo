import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SkipResponseWrap } from '../decorators/skip-response-wrap.decorator';
import { AuditService } from './audit.service';

/**
 * 内部接口：Agent 端（python）回调写审计日志。
 * 鉴权：x-internal-api-key header 必须等于 .env 中 INTERNAL_API_KEY。
 * 路径：POST /api/v1/internal/audit-log
 */
@Controller('internal')
export class AuditController {
  constructor(
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  @Post('audit-log')
  @HttpCode(204)
  @SkipResponseWrap()
  async write(
    @Headers('x-internal-api-key') apiKey: string | undefined,
    @Body()
    body: {
      trace_id?: string;
      user_id?: string;
      event_type?: string;
      severity?: 'info' | 'warn' | 'block';
      payload?: Record<string, unknown>;
    },
  ): Promise<void> {
    const expected = this.config.get<string>('INTERNAL_API_KEY');
    if (!expected || !apiKey || apiKey !== expected) {
      throw new ForbiddenException('invalid internal api key');
    }
    if (!body.event_type) {
      throw new BadRequestException('event_type required');
    }
    await this.audit.log({
      traceId: body.trace_id ?? null,
      userId: body.user_id ?? null,
      eventType: body.event_type,
      severity: body.severity ?? 'info',
      payload: body.payload,
    });
  }
}
