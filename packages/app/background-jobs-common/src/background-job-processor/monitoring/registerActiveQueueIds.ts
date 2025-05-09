import type { RedisConfig } from '@lokalise/node-core'
import type { QueueConfiguration } from '../managers/index.ts'
import { createSanitizedRedisClient } from '../public-utils/index.ts'
import { QUEUE_IDS_KEY } from '../constants.ts'
import { resolveQueueId } from '../utils.ts'

export const registerActiveQueueIds = async (
  redisConfig: RedisConfig,
  queuesConfig: Pick<QueueConfiguration, 'queueId' | 'bullDashboardGrouping'>[],
): Promise<void> => {
  if (queuesConfig.length === 0) return

  const redis = createSanitizedRedisClient(redisConfig)
  const now = Date.now()
  for (const resolvedQueueId of queuesConfig.map(resolveQueueId)) {
    await redis.zadd(QUEUE_IDS_KEY, now, resolvedQueueId)
  }
  redis.disconnect()
}
