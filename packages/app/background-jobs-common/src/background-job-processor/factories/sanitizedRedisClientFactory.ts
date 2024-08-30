import type { RedisConfig } from '@lokalise/node-core'
import Redis from 'ioredis'
import { sanitizeRedisConfig } from '../utils'

export const createSanitizedRedisClient = (redisConfig: RedisConfig): Redis =>
  new Redis(sanitizeRedisConfig(redisConfig))
