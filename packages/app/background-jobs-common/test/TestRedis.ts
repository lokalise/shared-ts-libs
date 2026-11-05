import { Redis, type RedisOptions } from 'ioredis'

export function getTestRedisConfig(): RedisOptions {
  return {
    host: process.env.REDIS_HOST!,
    port: Number(process.env.REDIS_PORT),
    db: process.env.REDIS_DB ? Number.parseInt(process.env.REDIS_DB, 10) : undefined,
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    keyPrefix: process.env.REDIS_KEY_PREFIX,
    commandTimeout: process.env.REDIS_COMMAND_TIMEOUT
      ? Number.parseInt(process.env.REDIS_COMMAND_TIMEOUT, 10)
      : undefined,
    connectTimeout: process.env.REDIS_CONNECT_TIMEOUT
      ? Number.parseInt(process.env.REDIS_CONNECT_TIMEOUT, 10)
      : undefined,
  }
}

export function createRedisClient(redisConfig: RedisOptions): Redis {
  return new Redis({
    ...redisConfig,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })
}
