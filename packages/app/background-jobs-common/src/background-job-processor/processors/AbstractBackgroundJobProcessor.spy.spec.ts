import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DependencyMocks } from '../../../test/dependencyMocks'
import { TestFailingBackgroundJobProcessor } from '../../../test/processors/TestFailingBackgroundJobProcessor'
import { TestReturnValueBackgroundJobProcessor } from '../../../test/processors/TestReturnValueBackgroundJobProcessor'
import { BaseJobPayload } from '../types'

import { FakeBackgroundJobProcessor } from './FakeBackgroundJobProcessor'
import { BackgroundJobProcessorDependencies } from './types'

type JobData = {
	id: string
	value: string
} & BaseJobPayload

describe('AbstractBackgroundJobProcessor Spy', () => {
	let mocks: DependencyMocks
	let deps: BackgroundJobProcessorDependencies<JobData, any>

	beforeEach(() => {
		mocks = new DependencyMocks()
		deps = mocks.create()
	})

	afterEach(async () => {
		await mocks.dispose()
	})

	describe('spy', () => {
		it('throws error when spy accessed in non-test mode', async () => {
			const processor = new TestFailingBackgroundJobProcessor<JobData>(
				deps,
				'AbstractBackgroundJobProcessor_spy',
				false,
			)

			expect(() => processor.spy).throws(
				'spy was not instantiated, it is only available on test mode. Please use `config.isTest` to enable it.',
			)

			await processor.dispose()
		})

		it('spy contain returnValue', async () => {
			type JobReturn = { result: string }

			const returnValue: JobReturn = { result: 'done' }
			const processor = new TestReturnValueBackgroundJobProcessor<JobData, JobReturn>(
				deps,
				returnValue,
			)
			await processor.start()

			const jobId = await processor.schedule({
				id: 'test_id',
				value: 'test',
				metadata: { correlationId: 'correlation_id' },
			})
			const jobSpy = await processor.spy.waitForFinishedJobWithId(jobId, 'completed')

			expect(jobSpy.returnvalue).toMatchObject(returnValue)

			await processor.dispose()
		})

		it('can await job to be scheduled', async () => {
			const jobProcessor = new FakeBackgroundJobProcessor<JobData>(deps, 'queue1')
			await jobProcessor.schedule({
				id: '123',
				value: 'val1',
				metadata: {
					correlationId: '111',
				},
			})

			const awaitResult = await jobProcessor.spy.waitForScheduledJob((job) => job.value === 'val1')
			expect(awaitResult.data).toMatchInlineSnapshot(`
				{
				  "id": "123",
				  "metadata": {
				    "correlationId": "111",
				  },
				  "value": "val1",
				}
			`)
		})
	})
})
