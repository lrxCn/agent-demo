export interface QuotaConfig {
  dailyTokensPerUser: number;
  perThread: number;
  redisKeyPrefix: string;
  redisUrl: string;
}

export function loadQuotaConfig(
  env: Record<string, string | undefined>,
): QuotaConfig {
  return {
    dailyTokensPerUser: Number(env.QUOTA_DAILY_TOKENS_PER_USER ?? 200_000),
    perThread: Number(env.QUOTA_PER_THREAD ?? 50_000),
    redisKeyPrefix: env.QUOTA_REDIS_KEY_PREFIX ?? 'plan2code:quota',
    redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
  };
}
