import { globalLogger } from '@lokalise/node-core'
import { Redis } from 'ioredis'
import { MockInstance, vi, vitest } from 'vitest'

import type { BackgroundJobProcessorDependencies } from '../src'
import { CommonBullmqFactory } from '../src/background-job-processor/processors/factories/CommonBullmqFactory'

const MAX_DB_INDEX = 16 // Redis supports up to 16 logical databases

let db = 0

const testLogger = globalLogger
export let lastInfoSpy: MockInstance
export let lastErrorSpy: MockInstance

export class DependencyMocks {
	private client?: Redis

	create(): BackgroundJobProcessorDependencies<any> {
		// eslint-disable-next-line @typescript-eslint/unbound-method
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
			} as any,
			logger: testLogger,
			errorReporter: {
				report: vi.fn(),
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
			? parseInt(process.env.REDIS_CONNECT_TIMEOUT, 10)
			: undefined
		const commandTimeout = process.env.REDIS_COMMAND_TIMEOUT
			? parseInt(process.env.REDIS_COMMAND_TIMEOUT, 10)
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
