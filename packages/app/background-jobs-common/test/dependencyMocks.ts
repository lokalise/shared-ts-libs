import { type RedisConfig, globalLogger } from '@lokalise/node-core'
import type { Redis } from 'ioredis'
import { type MockInstance, vi } from 'vitest'

import { type BackgroundJobProcessorDependencies, CommonBullmqFactory } from '../src'
import { createRedisClient, getTestRedisConfig } from './TestRedis'

const testLogger = globalLogger
export let lastInfoSpy: MockInstance
export let lastErrorSpy: MockInstance

export class DependencyMocks {
  private client?: Redis

  async clear() {
    await this.client!.flushall('SYNC')
  }

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
    await this.client?.disconnect(false)
  }

  getRedisConfig(): RedisConfig {
    return getTestRedisConfig()
  }

  startRedis(): Redis {
    const redisConfig = this.getRedisConfig()
    this.client = createRedisClient(redisConfig)
    return this.client
  }
}
