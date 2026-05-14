import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  CreateAuditLogInput,
  IAuditLogDao,
} from '../interfaces/audit-log-dao.interface';
import { AuditLog } from './audit-log.entity';

@Injectable()
export class AuditLogDaoSqlite implements IAuditLogDao {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  async create(input: CreateAuditLogInput): Promise<{ id: string }> {
    const entity = this.repo.create({
      traceId: input.traceId ?? null,
      userId: input.userId ?? null,
      eventType: input.eventType,
      severity: input.severity ?? 'info',
      payloadJson: input.payload ? JSON.stringify(input.payload) : null,
    });
    const saved = await this.repo.save(entity);
    return { id: saved.id };
  }

  async findRecent(limit = 50): Promise<
    Array<{
      id: string;
      traceId: string | null;
      userId: string | null;
      eventType: string;
      severity: string;
      payload: Record<string, unknown> | null;
      createdAt: Date;
    }>
  > {
    const rows = await this.repo.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      traceId: r.traceId ?? null,
      userId: r.userId ?? null,
      eventType: r.eventType,
      severity: r.severity,
      payload: r.payloadJson
        ? (JSON.parse(r.payloadJson) as Record<string, unknown>)
        : null,
      createdAt: r.createdAt,
    }));
  }
}
