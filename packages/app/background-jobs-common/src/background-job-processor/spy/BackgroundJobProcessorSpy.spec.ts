import { generateMonotonicUuid } from '@lokalise/id-utils'
import { Job } from 'bullmq'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { BackgroundJobProcessorSpy } from './BackgroundJobProcessorSpy'

type JobData = { value: string }

describe('BackgroundJobProcessorSpy', () => {
	describe('Using JobReturn as void', () => {
		let spy: BackgroundJobProcessorSpy<JobData, void>

		beforeAll(() => {
			spy = new BackgroundJobProcessorSpy()
		})

		beforeEach(() => {
			spy.clear()
		})

		describe('waitForJobWithId', () => {
			it('throws error when id is not defined or empty', async () => {
				await expect(
					async () => await spy.waitForJobWithId(undefined, 'completed'),
				).rejects.toThrowError('Job id is not defined or empty')
				await expect(async () => await spy.waitForJobWithId('', 'completed')).rejects.toThrowError(
					'Job id is not defined or empty',
				)
			})

			it('existing job is returned immediately', async () => {
				const id = generateMonotonicUuid()
				spy.addJobProcessingResult(createFakeJob({ value: 'test' }, id), 'completed')

				const result = await spy.waitForJobWithId(id, 'completed')
				expect(result.id).toBe(id)
			})

			it('non existing job creates promise', async () => {
				const id = generateMonotonicUuid()
				const promise = spy.waitForJobWithId(id, 'completed')
				await expect(isPromiseFinished(promise)).resolves.toBe(false)

				spy.addJobProcessingResult(createFakeJob({ value: 'test' }, id), 'completed')

				const result = await promise
				expect(result.id).toBe(id)
			})

			it('promise is resolved when the job pass to the right state', async () => {
				const id = generateMonotonicUuid()
				const promise1 = spy.waitForJobWithId(id, 'completed')
				const promise2 = spy.waitForJobWithId(id, 'failed')
				await expect(isPromiseFinished(promise1)).resolves.toBe(false)
				await expect(isPromiseFinished(promise2)).resolves.toBe(false)

				spy.addJobProcessingResult(createFakeJob({ value: 'test' }, id), 'failed')

				await expect(isPromiseFinished(promise1)).resolves.toBe(false)
				await expect(isPromiseFinished(promise2)).resolves.toBe(true)

				const result = await promise2
				expect(result.id).toBe(id)
			})
		})

		describe('waitForJob', () => {
			it('existing job is returned immediately', async () => {
				spy.addJobProcessingResult(createFakeJob({ value: 'test_1' }), 'completed')

				const result = await spy.waitForJob((data) => data.value === 'test_1', 'completed')
				expect(result.data.value).toBe('test_1')
			})

			it('non existing job creates promise', async () => {
				const promise = spy.waitForJob((data) => data.value === 'test_2', 'completed')
				await expect(isPromiseFinished(promise)).resolves.toBe(false)

				spy.addJobProcessingResult(createFakeJob({ value: 'test_2' }), 'completed')

				const result = await promise
				expect(result.data.value).toBe('test_2')
			})

			it('promise is resolved when the job pass to the right state', async () => {
				const promise1 = spy.waitForJob((data) => data.value === 'test_3', 'completed')
				const promise2 = spy.waitForJob((data) => data.value === 'test_3', 'failed')
				await expect(isPromiseFinished(promise1)).resolves.toBe(false)
				await expect(isPromiseFinished(promise2)).resolves.toBe(false)

				spy.addJobProcessingResult(createFakeJob({ value: 'test_3' }), 'failed')

				await expect(isPromiseFinished(promise1)).resolves.toBe(false)
				await expect(isPromiseFinished(promise2)).resolves.toBe(true)

				const result = await promise2
				expect(result.data.value).toBe('test_3')
			})

			it('promise is not resolved until the selector condition is met', async () => {
				const promise = spy.waitForJob((data) => data.value === 'expected', 'completed')
				await expect(isPromiseFinished(promise)).resolves.toBe(false)

				const job = createFakeJob({ value: 'wrong' })
				spy.addJobProcessingResult(job, 'completed')
				await expect(isPromiseFinished(promise)).resolves.toBe(false)

				job.data.value = 'expected'
				spy.addJobProcessingResult(job, 'completed')
				const result = await promise
				expect(result.id).toBe(job.id)
			})
		})

		describe('clean', () => {
			it('clean works', async () => {
				const promise = spy.waitForJob((data) => data.value === 'test', 'completed')

				spy.clear()

				spy.addJobProcessingResult(createFakeJob({ value: 'test' }), 'completed')
				await expect(isPromiseFinished(promise)).resolves.toBe(false)
			})
		})
	})

	describe('Using JobReturn as non-void', () => {
		type JobReturn = JobData

		let spy: BackgroundJobProcessorSpy<JobData, JobReturn>

		beforeAll(() => {
			spy = new BackgroundJobProcessorSpy()
		})

		beforeEach(() => {
			spy.clear()
		})

		it('waitForJobWithId promise returns proper returnedValue', async () => {
			const jobId = generateMonotonicUuid()
			spy.addJobProcessingResult(
				createFakeJob({ value: 'test_1' }, jobId, { value: 'done' }),
				'completed',
			)

			const result = await spy.waitForJobWithId(jobId, 'completed')
			expect(result.data).toMatchObject({ value: 'test_1' })
			expect(result.returnvalue).toMatchObject({ value: 'done' })
		})

		it('waitForJob promise returns proper returnedValue', async () => {
			const jobId = generateMonotonicUuid()
			spy.addJobProcessingResult(
				createFakeJob({ value: 'test_2' }, jobId, { value: 'done' }),
				'completed',
			)

			const result = await spy.waitForJob((data) => data.value === 'test_2', 'completed')
			expect(result.data).toMatchObject({ value: 'test_2' })
			expect(result.returnvalue).toMatchObject({ value: 'done' })
		})
	})
})

const isPromiseFinished = <T>(promise: Promise<T>): Promise<boolean> => {
	return Promise.race<boolean>([
		new Promise<boolean>((done) => setTimeout(() => done(false), 1000)),
		promise.then(() => true).catch(() => true),
	])
}

const createFakeJob = <JobData, JobReturn>(
	data: JobData,
	id?: string,
	returnValue?: JobReturn,
): Job<JobData, JobReturn> => {
	return {
		id: id ?? generateMonotonicUuid(),
		data,
		attemptsMade: 0,
		progress: 100,
		returnvalue: returnValue,
	} as Job<JobData, JobReturn>
}
