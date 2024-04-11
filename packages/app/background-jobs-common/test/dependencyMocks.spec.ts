import type { Redis } from 'ioredis'
import { describe, beforeAll, afterAll, it, expect } from 'vitest'

import { DependencyMocks } from './dependencyMocks'

describe('DependencyMocks', () => {
	let mocks: DependencyMocks
	let redis: Redis
	beforeAll(() => {
		mocks = new DependencyMocks()
		;({ redis } = mocks.create())
	})
	afterAll(async () => {
		await mocks.dispose()
	})

	it('should start redis server', async () => {
		expect(redis).toBeDefined()
		expect(await redis.ping()).toBe('PONG')
	})
})
