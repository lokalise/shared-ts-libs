import type { RedisConfig } from '@lokalise/node-core'
import { Redis } from 'ioredis'

export function getTestRedisConfig(): RedisConfig {
  return {
    host: process.env.REDIS_HOST!,
    port: Number(process.env.REDIS_PORT),
    db: process.env.REDIS_DB ? Number.parseInt(process.env.REDIS_DB, 10) : undefined,
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    keyPrefix: process.env.REDIS_KEY_PREFIX,
    useTls: false,
    commandTimeout: process.env.REDIS_COMMAND_TIMEOUT
      ? Number.parseInt(process.env.REDIS_COMMAND_TIMEOUT, 10)
      : undefined,
    connectTimeout: process.env.REDIS_CONNECT_TIMEOUT
      ? Number.parseInt(process.env.REDIS_CONNECT_TIMEOUT, 10)
      : undefined,
  }
}

export function createRedisClient(redisConfig: RedisConfig): Redis {
  return new Redis({
    ...redisConfig,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })
}
