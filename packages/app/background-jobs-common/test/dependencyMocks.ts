import { type RedisConfig, globalLogger } from '@lokalise/node-core'
import type { Redis } from 'ioredis'
import { type MockInstance, vi } from 'vitest'

import {
  type BackgroundJobProcessorDependencies,
  type BackgroundJobProcessorDependenciesNew,
  CommonBullmqFactory,
  FakeQueueManager,
  type QueueConfiguration,
  type SupportedQueueIds,
} from '../src'
import { createRedisClient, getTestRedisConfig } from './TestRedis'

const testLogger = globalLogger
export let lastInfoSpy: MockInstance
export let lastErrorSpy: MockInstance

export class DependencyMocks {
  private queueManager?: FakeQueueManager<any>
  private redis?: Redis

  getRedisConfig(): RedisConfig {
    return getTestRedisConfig()
  }

  startRedis(): Redis {
    const redisConfig = this.getRedisConfig()
    this.redis = createRedisClient(redisConfig)
    return this.redis
  }

  async clearRedis() {
    if (!this.redis) {
      this.redis = this.startRedis()
    }
    await this.redis!.flushall('SYNC')
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

  createNew<Queues extends QueueConfiguration[]>(
    queues: Queues,
  ): BackgroundJobProcessorDependenciesNew<Queues, SupportedQueueIds<Queues>> {
    this.queueManager = new FakeQueueManager(queues, {
      isTest: true,
      redisConfig: this.getRedisConfig(),
      lazyInitEnabled: true,
    })
    return {
      factory: new CommonBullmqFactory(),
      transactionObservabilityManager: {
        start: vi.fn(),
        stop: vi.fn(),
      } as any,
      logger: testLogger,
      errorReporter: {
        report: vi.fn(),
      } as any,
      queueManager: this.queueManager,
    }
  }

  async dispose(): Promise<void> {
    await this.queueManager?.dispose()
    await this.redis?.disconnect(false)
    this.redis = undefined
  }
}
