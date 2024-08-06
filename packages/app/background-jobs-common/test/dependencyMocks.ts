import { type RedisConfig, globalLogger } from '@lokalise/node-core'
import { Redis } from 'ioredis'
import { type MockInstance, vi } from 'vitest'

import { type BackgroundJobProcessorDependencies, CommonBullmqFactory } from '../src'

const testLogger = globalLogger
export let lastInfoSpy: MockInstance
export let lastErrorSpy: MockInstance

export class DependencyMocks {
  private client?: Redis

  create(): BackgroundJobProcessorDependencies<any> {
    return {
      bullmqFactory: new CommonBullmqFactory(),
      transactionObservabilityManager: {
        start: vi.fn(),
        stop: vi.fn(),
      } as any,
      logger: testLogger,
      errorReporter: {
        report: vi.fn(),
      } as any,
    }
  }

  async dispose(): Promise<void> {
    await this.client?.quit()
  }

  getRedisConfig(): RedisConfig {
    return {
      host: process.env.REDIS_HOST!,
      port: Number(process.env.REDIS_PORT),
      db: process.env.REDIS_DB ? Number.parseInt(process.env.REDIS_DB) : undefined,
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

  startRedis(): Redis {
    const redisConfig = this.getRedisConfig()
    this.client = new Redis({
      ...redisConfig,
      keyPrefix: undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    })

    return this.client
  }
}
