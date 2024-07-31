import type { RedisConfig } from '@lokalise/node-core'
import { Redis } from 'ioredis'
import { QUEUE_IDS_KEY, RETENTION_QUEUE_IDS_IN_DAYS } from '../constants'
import { daysToMilliseconds, isRedisClient, sanitizeRedisConfig } from '../utils'

export const backgroundJobProcessorGetActiveQueueIds = async (
  redis: RedisConfig | Redis,
): Promise<string[]> => {
  const redisWithoutPrefix = isRedisClient(redis) ? redis : new Redis(sanitizeRedisConfig(redis))

  await cleanOldQueueIds(redisWithoutPrefix)

  const queueIds = await redisWithoutPrefix.zrange(QUEUE_IDS_KEY, 0, -1)
  if (!isRedisClient(redis)) redisWithoutPrefix.disconnect()

  return queueIds.sort()
}

const cleanOldQueueIds = async (redis: Redis): Promise<void> => {
  const maxTimestamp = Date.now() - daysToMilliseconds(RETENTION_QUEUE_IDS_IN_DAYS)
  await redis.zremrangebyscore(QUEUE_IDS_KEY, '-inf', maxTimestamp)
}
