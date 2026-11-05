import type { RedisOptions } from 'ioredis'

process.loadEnvFile('./.env.test')

export const getTestRedisConfig = (): RedisOptions => {
  return {
    host: process.env.REDIS_HOST!,
    password: process.env.REDIS_PASSWORD,
    keyPrefix: process.env.REDIS_KEY_PREFIX,
    port: Number(process.env.REDIS_PORT),
  }
}
