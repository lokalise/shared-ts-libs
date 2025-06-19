import type { RedisConfig } from '@lokalise/node-core'

export const sanitizeRedisConfig = (config: RedisConfig): RedisConfig => ({
  ...config,
  keyPrefix: undefined,
  maxRetriesPerRequest: null, // Has to be null for compatibility with BullMQ, see: https://docs.bullmq.io/bull/patterns/persistent-connections#workers
})
