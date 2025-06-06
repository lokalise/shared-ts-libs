import type { RedisConfig } from '@lokalise/node-core'
import type { Redis } from 'ioredis'
import { QUEUE_IDS_KEY, RETENTION_QUEUE_IDS_IN_DAYS } from '../constants.ts'
import { createSanitizedRedisClient } from '../public-utils/index.ts'
import { daysToMilliseconds, isRedisClient } from '../utils.ts'

export const backgroundJobProcessorGetActiveQueueIds = async (
  redis: RedisConfig | Redis,
): Promise<string[]> => {
  const redisWithoutPrefix = isRedisClient(redis) ? redis : createSanitizedRedisClient(redis)

  await cleanOldQueueIds(redisWithoutPrefix)

  const queueIds = await redisWithoutPrefix.zrange(QUEUE_IDS_KEY, 0, -1)
  if (!isRedisClient(redis)) redisWithoutPrefix.disconnect()

  return queueIds.sort()
}

const cleanOldQueueIds = async (redis: Redis): Promise<void> => {
  const maxTimestamp = Date.now() - daysToMilliseconds(RETENTION_QUEUE_IDS_IN_DAYS)
  await redis.zremrangebyscore(QUEUE_IDS_KEY, '-inf', maxTimestamp)
}
