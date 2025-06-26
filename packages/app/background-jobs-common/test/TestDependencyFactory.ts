import { globalLogger, type RedisConfig } from '@lokalise/node-core'
import type { Redis } from 'ioredis'
import { vi } from 'vitest'
import { CommonBullmqFactoryNew } from '../src/background-job-processor/factories/CommonBullmqFactoryNew.ts'
import {
  type BackgroundJobProcessorDependencies,
  type BackgroundJobProcessorDependenciesNew,
  CommonBullmqFactory,
  FakeQueueManager,
  type QueueConfiguration,
  type QueueManager,
  type SupportedQueueIds,
} from '../src/index.ts'
import { createRedisClient, getTestRedisConfig } from './TestRedis.ts'

const testLogger = globalLogger
export class TestDependencyFactory {
  private queueManager?: QueueManager<any>
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
    if (!this.redis) this.redis = this.startRedis()

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
    isTest = true,
    lazyInitEnabled = true,
  ): BackgroundJobProcessorDependenciesNew<Queues, SupportedQueueIds<Queues>> {
    this.queueManager = new FakeQueueManager(queues, {
      isTest,
      redisConfig: this.getRedisConfig(),
      lazyInitEnabled,
    })
    return {
      workerFactory: new CommonBullmqFactoryNew(),
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
    await this.clearRedis() // cleaning before disconnecting
    await this.redis?.disconnect(false)
    this.redis = undefined
  }
}
