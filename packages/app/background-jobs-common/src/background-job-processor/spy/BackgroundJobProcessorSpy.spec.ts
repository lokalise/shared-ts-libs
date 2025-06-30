import { generateMonotonicUuid } from '@lokalise/id-utils'
import type { Job } from 'bullmq'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { isPromiseFinished } from '../../../test/isPromiseFinished.ts'
import { BackgroundJobProcessorSpy } from './BackgroundJobProcessorSpy.ts'

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
        spy.addJob(createFakeJob({ value: 'test' }, id), 'completed')

        const result = await spy.waitForJobWithId(id, 'completed')
        expect(result.id).toBe(id)
      })

      it('non existing job creates promise', async () => {
        const id = generateMonotonicUuid()
        const promise = spy.waitForJobWithId(id, 'completed')
        await expect(isPromiseFinished(promise)).resolves.toBe(false)

        spy.addJob(createFakeJob({ value: 'test' }, id), 'completed')

        const result = await promise
        expect(result.id).toBe(id)
      })

      it('promise is resolved when the job pass to the right state', async () => {
        const id = generateMonotonicUuid()
        const promise1 = spy.waitForJobWithId(id, 'completed')
        const promise2 = spy.waitForJobWithId(id, 'failed')
        await expect(isPromiseFinished(promise1)).resolves.toBe(false)
        await expect(isPromiseFinished(promise2)).resolves.toBe(false)

        spy.addJob(createFakeJob({ value: 'test' }, id), 'failed')

        await expect(isPromiseFinished(promise1)).resolves.toBe(false)
        await expect(isPromiseFinished(promise2)).resolves.toBe(true)

        const result = await promise2
        expect(result.id).toBe(id)
      })

      it('waits for job to be scheduled and it is not removed after completion', async () => {
        const id = generateMonotonicUuid()
        const promise1 = spy.waitForJobWithId(id, 'scheduled')
        await expect(isPromiseFinished(promise1)).resolves.toBe(false)

        spy.addJob(createFakeJob({ value: 'test' }, id), 'scheduled')
        const result1 = await promise1
        expect(result1.id).toBe(id)

        const promise2 = spy.waitForJobWithId(id, 'completed')
        await expect(isPromiseFinished(promise2)).resolves.toBe(false)

        spy.addJob(createFakeJob({ value: 'test' }, id), 'completed')
        const result2 = await promise2
        expect(result2.id).toBe(id)

        const scheduledAfterCompletion = await spy.waitForJobWithId(id, 'completed')
        expect(scheduledAfterCompletion.id).toBe(id)
      })
    })

    describe('waitForJob', () => {
      it('existing job is returned immediately', async () => {
        spy.addJob(createFakeJob({ value: 'test_1' }), 'completed')

        const result = await spy.waitForJob((data) => data.value === 'test_1', 'completed')
        expect(result.data.value).toBe('test_1')
      })

      it('non existing job creates promise', async () => {
        const promise = spy.waitForJob((data) => data.value === 'test_2', 'completed')
        await expect(isPromiseFinished(promise)).resolves.toBe(false)

        spy.addJob(createFakeJob({ value: 'test_2' }), 'completed')

        const result = await promise
        expect(result.data.value).toBe('test_2')
      })

      it('promise is resolved when the job pass to the right state', async () => {
        const promise1 = spy.waitForJob((data) => data.value === 'test_3', 'completed')
        const promise2 = spy.waitForJob((data) => data.value === 'test_3', 'failed')
        await expect(isPromiseFinished(promise1)).resolves.toBe(false)
        await expect(isPromiseFinished(promise2)).resolves.toBe(false)

        spy.addJob(createFakeJob({ value: 'test_3' }), 'failed')

        await expect(isPromiseFinished(promise1)).resolves.toBe(false)
        await expect(isPromiseFinished(promise2)).resolves.toBe(true)

        const result = await promise2
        expect(result.data.value).toBe('test_3')
      })

      it('promise is not resolved until the selector condition is met', async () => {
        const promise = spy.waitForJob((data) => data.value === 'expected', 'completed')
        await expect(isPromiseFinished(promise)).resolves.toBe(false)

        const job = createFakeJob({ value: 'wrong' })
        spy.addJob(job, 'completed')
        await expect(isPromiseFinished(promise)).resolves.toBe(false)

        job.data.value = 'expected'
        spy.addJob(job, 'completed')
        const result = await promise
        expect(result.id).toBe(job.id)
      })

      it('waits for job to be scheduled and it is not removed after completion', async () => {
        const value = 'test'
        const promise1 = spy.waitForJob((e) => e.value === value, 'scheduled')
        await expect(isPromiseFinished(promise1)).resolves.toBe(false)

        spy.addJob(createFakeJob({ value }), 'scheduled')
        const result1 = await promise1
        expect(result1.data.value).toBe(value)

        const promise2 = spy.waitForJob((e) => e.value === value, 'completed')
        await expect(isPromiseFinished(promise2)).resolves.toBe(false)

        spy.addJob(createFakeJob({ value }, result1.id), 'completed')
        const result2 = await promise2
        expect(result2.id).toBe(result1.id)

        const scheduledAfterCompletion = await spy.waitForJob((e) => e.value === value, 'completed')
        expect(scheduledAfterCompletion.id).toBe(result1.id)
      })
    })

    describe('clean', () => {
      it('clean works', async () => {
        const promise = spy.waitForJob((data) => data.value === 'test', 'completed')

        spy.clear()

        spy.addJob(createFakeJob({ value: 'test' }), 'completed')
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
      spy.addJob(createFakeJob({ value: 'test_1' }, jobId, { value: 'done' }), 'completed')

      const result = await spy.waitForJobWithId(jobId, 'completed')
      expect(result.data).toMatchObject({ value: 'test_1' })
      expect(result.returnvalue).toMatchObject({ value: 'done' })
    })

    it('waitForJob promise returns proper returnedValue', async () => {
      const jobId = generateMonotonicUuid()
      spy.addJob(createFakeJob({ value: 'test_2' }, jobId, { value: 'done' }), 'completed')

      const result = await spy.waitForJob((data) => data.value === 'test_2', 'completed')
      expect(result.data).toMatchObject({ value: 'test_2' })
      expect(result.returnvalue).toMatchObject({ value: 'done' })
    })
  })
})

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
