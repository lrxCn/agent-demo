import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';

import { TraceContext } from '../context/trace-context';
import { loadQuotaConfig, type QuotaConfig } from './quota.config';

/** 配额超限异常（前端会拿到 429 + 中文提示） */
export class QuotaExceededException extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

@Injectable()
export class QuotaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QuotaService.name);
  private redis!: Redis;
  private config!: QuotaConfig;

  onModuleInit(): void {
    this.config = loadQuotaConfig(process.env);
    this.redis = new Redis(this.config.redisUrl, {
      lazyConnect: false,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 3,
    });
    this.redis.on('error', (err) =>
      this.logger.error(`Redis 错误: ${err.message}`),
    );
    this.logger.log(
      JSON.stringify({
        msg: 'QuotaService 已启动',
        daily: this.config.dailyTokensPerUser,
        per_thread: this.config.perThread,
      }),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit().catch(() => undefined);
  }

  private dailyKey(userId: string): string {
    const today = new Date().toISOString().slice(0, 10);
    return `${this.config.redisKeyPrefix}:user:${userId}:${today}`;
  }

  private threadKey(threadId: string): string {
    return `${this.config.redisKeyPrefix}:thread:${threadId}`;
  }

  /**
   * 入口预检：根据估算值做硬性配额拦截，超限抛 429。
   * 说明：这里不预占额度，避免流式异常终止后回滚逻辑复杂化。
   */
  async checkAndReserve(
    userId: string,
    threadId: string,
    estimatedTokens: number,
  ): Promise<number> {
    const dKey = this.dailyKey(userId);
    const tKey = this.threadKey(threadId);
    const [dailyUsed, threadUsed] = await Promise.all([
      this.redis.get(dKey),
      this.redis.get(tKey),
    ]);
    const dailyN = Number(dailyUsed ?? 0);
    const threadN = Number(threadUsed ?? 0);

    if (dailyN + estimatedTokens > this.config.dailyTokensPerUser) {
      this.logger.warn(
        JSON.stringify({
          trace_id: TraceContext.getTraceId(),
          user_id: userId,
          thread_id: threadId,
          module: 'quota',
          level: 'warn',
          msg: '日配额超限',
          extra: {
            used: dailyN,
            requested: estimatedTokens,
            cap: this.config.dailyTokensPerUser,
          },
        }),
      );
      throw new QuotaExceededException(
        `今日 AI 用量已达上限（${this.config.dailyTokensPerUser} tokens），请明日再试`,
      );
    }

    if (threadN + estimatedTokens > this.config.perThread) {
      this.logger.warn(
        JSON.stringify({
          trace_id: TraceContext.getTraceId(),
          user_id: userId,
          thread_id: threadId,
          module: 'quota',
          level: 'warn',
          msg: '单会话配额超限',
          extra: {
            used: threadN,
            requested: estimatedTokens,
            cap: this.config.perThread,
          },
        }),
      );
      throw new QuotaExceededException('当前会话 token 用量过大，请新建会话继续');
    }

    return estimatedTokens;
  }

  /**
   * 在流式结束后提交本次估算 token，用于累计统计。
   * Daily key TTL 48h；thread key TTL 7d。
   */
  async commit(
    userId: string,
    threadId: string,
    actualTokens: number,
  ): Promise<void> {
    if (actualTokens <= 0) {
      return;
    }
    const dKey = this.dailyKey(userId);
    const tKey = this.threadKey(threadId);
    const pipeline = this.redis.pipeline();
    pipeline.incrby(dKey, actualTokens).expire(dKey, 48 * 3600);
    pipeline.incrby(tKey, actualTokens).expire(tKey, 7 * 24 * 3600);
    await pipeline.exec().catch((e) => {
      this.logger.warn(
        `commit 失败 user=${userId} thread=${threadId}: ${(e as Error).message}`,
      );
    });
  }

  /** 粗估 token：字符数 / 3 向上取整。 */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 3);
  }
}
