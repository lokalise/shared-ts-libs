import { generateMonotonicUuid } from '@lokalise/id-utils'
import { waitAndRetry } from '@lokalise/node-core'
import { UnrecoverableError } from 'bullmq'
import { symbols } from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DependencyMocks, lastInfoSpy } from '../../../test/dependencyMocks'
import { TestFailingBackgroundJobProcessor } from '../../../test/processors/TestFailingBackgroundJobProcessor'
import { TestReturnValueBackgroundJobProcessor } from '../../../test/processors/TestReturnValueBackgroundJobProcessor'
import { TestStalledBackgroundJobProcessor } from '../../../test/processors/TestStalledBackgroundJobProcessor'
import { TestSuccessBackgroundJobProcessor } from '../../../test/processors/TestSucessBackgroundJobProcessor'
import { RETENTION_QUEUE_IDS_IN_DAYS } from '../constants'
import { BackgroundJobProcessorDependencies, BaseJobPayload } from '../types'
import { daysToMilliseconds } from '../utils'

import { AbstractBackgroundJobProcessor } from './AbstractBackgroundJobProcessor'
import { FakeBackgroundJobProcessor } from './FakeBackgroundJobProcessor'

type JobData = {
	id: string
	value: string
} & BaseJobPayload

const QUEUE_IDS_KEY = 'background-jobs-common:background-job:queues'

describe('AbstractBackgroundJobProcessor', () => {
	let mocks: DependencyMocks
	let deps: BackgroundJobProcessorDependencies<JobData, any>

	beforeEach(() => {
		mocks = new DependencyMocks()
		deps = mocks.create()
	})

	afterEach(async () => {
		await mocks.dispose()
	})

	describe('getActiveQueueIds', () => {
		beforeEach(async () => {
			await deps.redis.del(QUEUE_IDS_KEY)
		})

		it('returns not expired elements on the set', async () => {
			const retentionMs = daysToMilliseconds(RETENTION_QUEUE_IDS_IN_DAYS)
			await deps.redis.zadd(QUEUE_IDS_KEY, Date.now() - retentionMs, 'expired')
			await deps.redis.zadd(QUEUE_IDS_KEY, Date.now(), 'queue2')
			await deps.redis.zadd(QUEUE_IDS_KEY, Date.now() - retentionMs + 100, 'queue1')

			const queues = await AbstractBackgroundJobProcessor.getActiveQueueIds(deps.redis)
			expect(queues).toEqual(['queue1', 'queue2'])
		})
	})

	describe('start', () => {
		beforeEach(async () => {
			await deps.redis.del(QUEUE_IDS_KEY)
		})

		it('throws an error if queue id is not unique', async () => {
			const job1 = new FakeBackgroundJobProcessor<JobData>(deps, 'queue1')
			const job2 = new FakeBackgroundJobProcessor<JobData>(deps, 'queue2')

			await job1.start()
			await job2.start()
			await expect(new FakeBackgroundJobProcessor<JobData>(deps, 'queue1').start()).rejects.toThrow(
				/Queue id "queue1" is not unique/,
			)

			await job1.dispose()
			await job2.dispose()
		})

		it('Multiple start calls not produce errors', async () => {
			const processor = new FakeBackgroundJobProcessor<JobData>(deps, 'queue1')

			await expect(processor.start()).resolves.not.toThrowError()
			await expect(processor.start()).resolves.not.toThrowError()

			await processor.dispose()
		})

		it('lazy loading on schedule', async () => {
			const processor = new FakeBackgroundJobProcessor<JobData>(deps, 'queue1')

			const jobId = await processor.schedule({
				id: 'test_id',
				value: 'test',
				metadata: { correlationId: 'correlation_id' },
			})
			const spyResult = await processor.spy.waitForJobWithId(jobId, 'completed')

			expect(spyResult.data).toMatchObject({
				id: 'test_id',
				value: 'test',
				metadata: { correlationId: 'correlation_id' },
			})
			await processor.dispose()
		})

		it('lazy loading on scheduleBulk', async () => {
			const processor = new FakeBackgroundJobProcessor<JobData>(deps, 'queue1')

			const jobIds = await processor.scheduleBulk([
				{ id: 'test_id', value: 'test', metadata: { correlationId: 'correlation_id' } },
			])
			const spyResult = await processor.spy.waitForJobWithId(jobIds[0], 'completed')

			expect(spyResult.data).toMatchObject({
				id: 'test_id',
				value: 'test',
				metadata: { correlationId: 'correlation_id' },
			})
			await processor.dispose()
		})

		it('queue id is stored/updated on redis with current timestamp', async () => {
			const processor = new FakeBackgroundJobProcessor<JobData>(deps, 'queue1')
			await processor.start()

			const today = new Date()
			const [value, score] = await deps.redis.zrange(QUEUE_IDS_KEY, 0, -1, 'WITHSCORES')
			expect(value).toBe('queue1')
			// Comparing timestamps in seconds
			const todaySeconds = Math.floor(today.getTime() / 1000)
			const scoreSeconds = Math.floor(new Date(parseInt(score)).getTime() / 1000)
			// max difference 1 to handle edge case of 0.1 - 1.0
			expect(scoreSeconds - todaySeconds).lessThanOrEqual(1)

			// disposing and restarting to check that timestamp is updated
			await processor.dispose()
			await processor.start()

			const [value2, score2] = await deps.redis.zrange(QUEUE_IDS_KEY, 0, -1, 'WITHSCORES')
			expect(value2).toBe('queue1')
			expect(new Date(parseInt(score))).not.toEqual(new Date(parseInt(score2)))

			await processor.dispose()
		})
	})

	describe('success', () => {
		const QueueName = 'AbstractBackgroundJobProcessor_success'
		let processor: FakeBackgroundJobProcessor<JobData>

		beforeEach(async () => {
			processor = new FakeBackgroundJobProcessor<JobData>(deps, QueueName)
			await processor.start()
		})

		afterEach(async () => {
			await processor.dispose()
		})

		it('runs the job logging with autogenerated id', async () => {
			const jobData = {
				id: generateMonotonicUuid(),
				value: 'test',
				metadata: { correlationId: generateMonotonicUuid() },
			}
			const jobId = await processor.schedule(jobData)

			const job = await processor.spy.waitForJobWithId(jobId, 'completed')
			expect(job.data).toMatchObject(jobData)

			expect(lastInfoSpy).toHaveBeenCalledTimes(2)
			expect(lastInfoSpy.mock.calls[0]).toMatchObject([
				{
					origin: 'FakeBackgroundJobProcessor',
					jobId,
				},
				'Started job FakeBackgroundJobProcessor',
				[],
			])
			expect(lastInfoSpy.mock.calls[1]).toMatchObject([
				{
					isSuccess: true,
					jobId,
				},
				'Finished job FakeBackgroundJobProcessor',
				[],
			])
		})

		it('schedules and runs multiple jobs', async () => {
			const scheduledJobIds = await processor.scheduleBulk([
				{
					id: generateMonotonicUuid(),
					value: 'first',
					metadata: { correlationId: generateMonotonicUuid() },
				},
				{
					id: generateMonotonicUuid(),
					value: 'second',
					metadata: { correlationId: generateMonotonicUuid() },
				},
			])

			expect(scheduledJobIds.length).toBe(2)

			const firstJob = await processor.spy.waitForJobWithId(scheduledJobIds[0], 'completed')
			const secondJob = await processor.spy.waitForJobWithId(scheduledJobIds[1], 'completed')

			expect(firstJob.data.value).toBe('first')
			expect(secondJob.data.value).toBe('second')
		})

		it('stops the worker on dispose', async () => {
			// Given
			const jobData = {
				id: generateMonotonicUuid(),
				value: 'test',
				metadata: { correlationId: generateMonotonicUuid() },
			}

			await processor.schedule(jobData)
			const job = await processor.spy.waitForJob((data) => data.id === jobData.id, 'completed')
			expect(job.data).toMatchObject(jobData)

			// When
			await processor.dispose()
			const logSpy = vi.spyOn(deps.logger, 'info')

			// Then
			await processor.schedule({
				id: generateMonotonicUuid(),
				value: 'test',
				metadata: { correlationId: generateMonotonicUuid() },
			})

			// Further scheduled jobs are not executed
			await waitAndRetry(() => logSpy.mock.calls.length > 0)
			expect(logSpy).not.toHaveBeenCalled()
		})

		it('should trigger onSuccess hook', async () => {
			// Given
			const jobData = {
				id: generateMonotonicUuid(),
				value: 'test',
				metadata: { correlationId: generateMonotonicUuid() },
			}

			const successBackgroundJobProcessor = new TestSuccessBackgroundJobProcessor(
				deps,
				'TestSuccessBackgroundJobProcessor',
			)

			await successBackgroundJobProcessor.schedule(jobData)
			const job = await successBackgroundJobProcessor.spy.waitForJob(
				(data) => data.id === jobData.id,
				'completed',
			)
			expect(job.data).toMatchObject(jobData)

			// When
			await successBackgroundJobProcessor.dispose()

			// Then
			expect(successBackgroundJobProcessor.onSuccessCallsCounter).toBe(1)
		})
		it('should handle onSuccess hook error', async () => {
			// Given
			const jobData = {
				id: generateMonotonicUuid(),
				value: 'test',
				metadata: { correlationId: generateMonotonicUuid() },
			}

			const successBackgroundJobProcessor = new TestSuccessBackgroundJobProcessor(
				deps,
				'TestSuccessBackgroundJobProcessor',
			)
			successBackgroundJobProcessor.onSuccessHook = () => {
				throw new Error('onSuccessError')
			}

			await successBackgroundJobProcessor.schedule(jobData)
			const job = await successBackgroundJobProcessor.spy.waitForJob(
				(data) => data.id === jobData.id,
				'completed',
			)
			expect(job.data).toMatchObject(jobData)

			// When
			await successBackgroundJobProcessor.dispose()

			// Then
			expect(successBackgroundJobProcessor.onSuccessCallsCounter).toBe(1)
		})
		it('should clear job data onSuccess', async () => {
			// Given
			const jobData = {
				id: generateMonotonicUuid(),
				value: 'test',
				metadata: { correlationId: generateMonotonicUuid() },
			}

			const successBackgroundJobProcessor = new TestSuccessBackgroundJobProcessor(
				deps,
				'TestSuccessBackgroundJobProcessor',
			)
			successBackgroundJobProcessor.onSuccessHook = (job) => {
				void successBackgroundJobProcessor.purgeJobData(job)
			}

			const jobId = await successBackgroundJobProcessor.schedule(jobData)
			const job = await successBackgroundJobProcessor.spy.waitForJobWithId(jobId, 'completed')

			// When
			await successBackgroundJobProcessor.dispose()

			// Then
			expect(successBackgroundJobProcessor.onSuccessCallsCounter).toBe(1)
			expect(job.data).toStrictEqual({ metadata: jobData.metadata })
		})
	})

	describe('error', () => {
		const QueueName = 'AbstractBackgroundJobProcessor_error'
		let processor: TestFailingBackgroundJobProcessor<JobData>

		beforeEach(async () => {
			processor = new TestFailingBackgroundJobProcessor<JobData>(deps, QueueName)
			await processor.start()
		})

		afterEach(async () => {
			await processor.dispose()
		})

		it('job is throwing normal errors', async () => {
			const errors = [
				new Error('normal test error 1'),
				new Error('normal test error 2'),
				new Error('normal test error 3'),
			]
			processor.errorsToThrowOnProcess = errors
			const scheduledJobId = await processor.schedule(
				{ id: 'test_id', value: 'test', metadata: { correlationId: 'correlation_id' } },
				{
					attempts: 3,
					delay: 0,
				},
			)
			const job = await processor.spy.waitForJobWithId(scheduledJobId, 'failed')

			expect(processor.errorsOnProcess).length(1)
			expect(job.attemptsMade).toBe(3)
			expect(processor.errorsOnProcess[0]).toMatchObject(errors[2])

			expect(processor.lastLogger[symbols.chindingsSym]).toContain('"x-request-id"')
		})

		it('job throws unrecoverable error at the beginning', async () => {
			const errors = [new UnrecoverableError('unrecoverable test error 1')]
			processor.errorsToThrowOnProcess = errors
			await processor.schedule(
				{ id: 'test_id', value: 'test', metadata: { correlationId: 'correlation_id' } },
				{
					attempts: 3,
					delay: 0,
				},
			)

			const job = await processor.spy.waitForJob((data) => data.id === 'test_id', 'failed')

			expect(processor.errorsOnProcess).length(1)
			expect(job.attemptsMade).toBe(1)
			expect(processor.errorsOnProcess[0]).toMatchObject(errors[0])
		})

		it('job throws unrecoverable error in the middle', async () => {
			const errors = [
				new Error('normal test error 1'),
				new UnrecoverableError('unrecoverable test error 2'),
			]
			processor.errorsToThrowOnProcess = errors
			await processor.schedule(
				{ id: 'test_id', value: 'test', metadata: { correlationId: 'correlation_id' } },
				{
					attempts: 3,
					delay: 0,
				},
			)

			const job = await processor.spy.waitForJob((data) => data.id === 'test_id', 'failed')

			expect(processor.errorsOnProcess).length(1)
			expect(job.attemptsMade).toBe(2)
			expect(processor.errorsOnProcess[0]).toMatchObject(errors[1])
		})

		it('error is triggered on failed hook', async () => {
			const onFailedError = new Error('onFailed error')
			processor.errorToThrowOnFailed = onFailedError
			processor.errorsToThrowOnProcess = [new UnrecoverableError('unrecoverable error')]

			const reportSpy = vi.spyOn(deps.errorReporter, 'report')

			await processor.schedule(
				{ id: 'test_id', value: 'test', metadata: { correlationId: 'correlation_id' } },
				{
					attempts: 3,
					delay: 0,
				},
			)

			const job = await processor.spy.waitForJob((data) => data.id === 'test_id', 'failed')

			expect(processor.errorsOnProcess).length(1)
			expect(reportSpy).toHaveBeenCalledWith({
				error: onFailedError,
				context: {
					id: job.id,
					errorJson: expect.stringContaining(onFailedError.message),
				},
			})
		})
	})

	describe('stalled', () => {
		let processor: TestStalledBackgroundJobProcessor

		beforeEach(async () => {
			processor = new TestStalledBackgroundJobProcessor(deps)
			await processor.start()
		})

		afterEach(async () => {
			await processor.dispose()
		})

		it('handling stalled errors', async () => {
			const errorReporterSpy = vi.spyOn(deps.errorReporter, 'report')
			const jobData = {
				id: generateMonotonicUuid(),
				metadata: { correlationId: generateMonotonicUuid() },
			}
			const jobId = await processor.schedule(jobData)

			await waitAndRetry(() => processor.onFailedErrors.length > 0, 100, 20)
			expect(processor?.onFailedErrors).length(1)

			const onFailedCall = processor?.onFailedErrors[0]
			expect(onFailedCall.error.message).toBe('job stalled more than allowable limit')
			expect(onFailedCall.job.id).toBe(jobId)
			expect(onFailedCall.job.data.id).toBe(jobData.id)
			expect(onFailedCall.job.attemptsMade).toBe(0)

			expect(errorReporterSpy).toHaveBeenCalledWith({
				error: onFailedCall.error,
				context: {
					id: jobId,
					errorJson: expect.stringContaining(onFailedCall.error.message),
				},
			})
			expect(processor.lastLogger[symbols.chindingsSym]).toContain('"x-request-id"')
		})
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
			const jobSpy = await processor.spy.waitForJobWithId(jobId, 'completed')

			expect(jobSpy.returnvalue).toMatchObject(returnValue)

			await processor.dispose()
		})
	})
})
