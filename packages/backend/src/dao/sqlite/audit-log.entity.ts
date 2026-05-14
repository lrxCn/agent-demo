import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * 监控体系 Phase 7-4 Step 5：Agent / Backend Guardrails 命中事件审计。
 * 字段约定见 docs/monitor/1.PRD.md §5.4.5。
 */
@Entity({ name: 'audit_logs' })
@Index(['traceId'])
@Index(['userId', 'createdAt'])
@Index(['eventType'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** W3C trace_id（32 hex），来自 TraceContext */
  @Column({ type: 'text', name: 'trace_id', nullable: true })
  traceId?: string | null;

  /** 触发用户 id；系统类事件可为空 */
  @Column({ type: 'text', name: 'user_id', nullable: true })
  userId?: string | null;

  /** quota_exceeded / tool_denied / prompt_injection / pii_filtered */
  @Column({ type: 'text', name: 'event_type' })
  eventType!: string;

  /** info / warn / block */
  @Column({ type: 'text', default: 'info' })
  severity!: string;

  /** 业务负载（JSON 序列化字符串） */
  @Column({ type: 'text', name: 'payload_json', nullable: true })
  payloadJson?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
