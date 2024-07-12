import type { RedisConfig } from '@lokalise/node-core'
import { sanitizeRedisConfig } from '../src'

process.loadEnvFile('./.env.test')

export const getTestRedisConfig = (): RedisConfig => {
  return {
    host: process.env.REDIS_HOST!,
    password: process.env.REDIS_PASSWORD,
    keyPrefix: process.env.REDIS_KEY_PREFIX,
    port: Number(process.env.REDIS_PORT),
    useTls: false,
  }
}

export const getSanitizedTestRedisConfig = (): RedisConfig => {
  return sanitizeRedisConfig(getTestRedisConfig())
}
