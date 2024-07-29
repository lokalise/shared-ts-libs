import type { RedisConfig } from '@lokalise/node-core'
import type Redis from 'ioredis'
import type { SafeJob } from './types'

export const daysToSeconds = (days: number): number => days * 24 * 60 * 60

export const daysToMilliseconds = (days: number): number => daysToSeconds(days) * 1000

export const resolveJobId = (job?: SafeJob<unknown>): string => job?.id ?? 'unknown'

export const isUnrecoverableJobError = (error: Error): boolean =>
  error.name === 'UnrecoverableError'

export const isStalledJobError = (error: Error): boolean =>
  error.message === 'job stalled more than allowable limit'

export const sanitizeRedisConfig = (config: RedisConfig): RedisConfig => {
  return { ...config, keyPrefix: undefined }
}

export const isRedisClient = (redis: RedisConfig | Redis): redis is Redis => 'options' in redis
