import { globalLogger } from '@lokalise/node-core'
import { Redis } from 'ioredis'
import { type MockInstance, vi, vitest } from 'vitest'

import { type BackgroundJobProcessorDependencies, CommonBullmqFactory } from '../src'

const testLogger = globalLogger
export let lastInfoSpy: MockInstance
export let lastErrorSpy: MockInstance

export class DependencyMocks {
  private client?: Redis

  create(): BackgroundJobProcessorDependencies<any> {
    const originalChildFn = testLogger.child

    const originalMethodSpy = vitest.spyOn(testLogger, 'child')
    originalMethodSpy.mockImplementation((...args) => {
      const childLogger = originalChildFn.apply(testLogger, args)
      lastInfoSpy = vitest.spyOn(childLogger, 'info')
      lastErrorSpy = vitest.spyOn(childLogger, 'error')
      return childLogger
    })

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

  startRedis(): Redis {
    const db = process.env.REDIS_DB ? Number.parseInt(process.env.REDIS_DB) : undefined
    const host = process.env.REDIS_HOST
    const port = process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : undefined
    const username = process.env.REDIS_USERNAME
    const password = process.env.REDIS_PASSWORD
    const connectTimeout = process.env.REDIS_CONNECT_TIMEOUT
      ? Number.parseInt(process.env.REDIS_CONNECT_TIMEOUT, 10)
      : undefined
    const commandTimeout = process.env.REDIS_COMMAND_TIMEOUT
      ? Number.parseInt(process.env.REDIS_COMMAND_TIMEOUT, 10)
      : undefined
    const keyPrefix = process.env.REDIS_KEY_PREFIX
    this.client = new Redis({
      host,
      db,
      keyPrefix,
      port,
      username,
      password,
      connectTimeout,
      commandTimeout,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    })

    return this.client
  }
}
