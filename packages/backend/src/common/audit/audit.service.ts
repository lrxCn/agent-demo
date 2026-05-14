import { Inject, Injectable, Logger } from '@nestjs/common';

import { AUDIT_LOG_DAO } from '../../dao/dao.tokens';
import type {
  CreateAuditLogInput,
  IAuditLogDao,
} from '../../dao/interfaces/audit-log-dao.interface';
import { TraceContext } from '../context/trace-context';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Inject(AUDIT_LOG_DAO) private readonly dao: IAuditLogDao) {}

  /** 后端直接调（如 quota / tool ACL 命中） */
  async log(input: CreateAuditLogInput): Promise<void> {
    const traceId = input.traceId ?? TraceContext.getTraceId() ?? null;
    try {
      const { id } = await this.dao.create({ ...input, traceId });
      this.logger.log(
        JSON.stringify({
          trace_id: traceId,
          user_id: input.userId ?? '',
          module: 'audit',
          level: 'info',
          msg: 'audit_log 写入成功',
          extra: { id, event_type: input.eventType, severity: input.severity },
        }),
      );
    } catch (e) {
      this.logger.warn(`audit_log 写入失败: ${(e as Error).message}`);
    }
  }
}
