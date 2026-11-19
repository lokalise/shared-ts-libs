import type { RedisOptions } from 'ioredis'

export const sanitizeRedisConfig = (config: RedisOptions): RedisOptions => ({
  ...config,
  keyPrefix: undefined,
  maxRetriesPerRequest: null, // Has to be null for compatibility with BullMQ, see: https://docs.bullmq.io/bull/patterns/persistent-connections#workers
})
