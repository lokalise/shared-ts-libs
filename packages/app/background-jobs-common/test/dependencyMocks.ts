import { globalLogger } from '@lokalise/node-core'
import { Redis } from 'ioredis'
import { type MockInstance, vi, vitest } from 'vitest'

import { type BackgroundJobProcessorDependencies, CommonBullmqFactory } from '../src'

const MAX_DB_INDEX = 16 // Redis supports up to 16 logical databases

let db = 0

const testLogger = globalLogger
export let lastInfoSpy: MockInstance
export let lastErrorSpy: MockInstance

export class DependencyMocks {
  private client?: Redis

  // biome-ignore lint/suspicious/noExplicitAny: it's okay
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
      redis: this.startRedis(),
      bullmqFactory: new CommonBullmqFactory(),
      transactionObservabilityManager: {
        start: vi.fn(),
        stop: vi.fn(),
        // biome-ignore lint/suspicious/noExplicitAny: it's okay
      } as any,
      logger: testLogger,
      errorReporter: {
        report: vi.fn(),
        // biome-ignore lint/suspicious/noExplicitAny: it's okay
      } as any,
    }
  }

  async dispose(): Promise<void> {
    await this.client?.flushall('SYNC')
    await this.client?.quit()
  }

  private startRedis(): Redis {
    // Increment DB to avoid duplicates/overlap. Each run should have its own DB.
    db++
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
    this.client = new Redis({
      host,
      db: db % MAX_DB_INDEX,
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
