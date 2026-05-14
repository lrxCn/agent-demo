export interface CreateAuditLogInput {
  traceId?: string | null;
  userId?: string | null;
  eventType: string;
  severity?: 'info' | 'warn' | 'block';
  payload?: Record<string, unknown>;
}

export interface IAuditLogDao {
  create(input: CreateAuditLogInput): Promise<{ id: string }>;
  findRecent(limit?: number): Promise<
    Array<{
      id: string;
      traceId: string | null;
      userId: string | null;
      eventType: string;
      severity: string;
      payload: Record<string, unknown> | null;
      createdAt: Date;
    }>
  >;
}
