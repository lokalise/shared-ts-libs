import { generateMonotonicUuid } from '@lokalise/id-utils'
import { waitAndRetry } from '@lokalise/node-core'
import { UnrecoverableError } from 'bullmq'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DependencyMocks } from '../../../test/dependencyMocks'
import { TestFailingBackgroundJobProcessor } from '../../../test/processors/TestFailingBackgroundJobProcessor'
import { TestStalledBackgroundJobProcessor } from '../../../test/processors/TestStalledBackgroundJobProcessor'
import { TestSuccessBackgroundJobProcessor } from '../../../test/processors/TestSucessBackgroundJobProcessor'
import type { BaseJobPayload } from '../types'

import type Redis from 'ioredis'
import { FakeBackgroundJobProcessor } from './FakeBackgroundJobProcessor'
import type { BackgroundJobProcessorDependencies } from './types'

type JobData = {
  id: string
  value: string
} & BaseJobPayload

const QUEUE_IDS_KEY = 'background-jobs-common:background-job:queues'

describe('AbstractBackgroundJobProcessor', () => {
  let mocks: DependencyMocks
  let deps: BackgroundJobProcessorDependencies<JobData, any>
  let redis: Redis

  beforeEach(async () => {
    mocks = new DependencyMocks()
    deps = mocks.create()
    redis = mocks.startRedis()

    await redis?.flushall('SYNC')
  })

  afterEach(async () => {
    await mocks.dispose()
  })

  describe('start', () => {
    beforeEach(async () => {
      await redis?.del(QUEUE_IDS_KEY)
    })

    it('throws an error if queue id is not unique', async () => {
      const job1 = new FakeBackgroundJobProcessor<JobData>(deps, 'queue1', mocks.getRedisConfig())
      const job2 = new FakeBackgroundJobProcessor<JobData>(deps, 'queue2', mocks.getRedisConfig())

      await job1.start()
      await job2.start()
      await expect(
        new FakeBackgroundJobProcessor<JobData>(deps, 'queue1', mocks.getRedisConfig()).start(),
      ).rejects.toThrow(/Queue id "queue1" is not unique/)

      await job1.dispose()
      await job2.dispose()
    })

    it('Multiple start calls (sequential or concurrent) not produce errors', async () => {
      const redisConfig = mocks.getRedisConfig()
      const processor = new FakeBackgroundJobProcessor<JobData>(deps, 'queue1', redisConfig)

      // sequential start calls
      await expect(processor.start()).resolves.not.toThrowError()
      await expect(processor.start()).resolves.not.toThrowError()
      await processor.dispose()

      // concurrent start calls
      await expect(Promise.all([processor.start(), processor.start()])).resolves.not.toThrowError()
      await processor.dispose()
    })

    it('lazy loading on schedule', async () => {
      const processor = new FakeBackgroundJobProcessor<JobData>(
        deps,
        'queue1',
        mocks.getRedisConfig(),
      )

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
      const processor = new FakeBackgroundJobProcessor<JobData>(
        deps,
        'queue1',
        mocks.getRedisConfig(),
      )

      const jobIds = await processor.scheduleBulk([
        {
          id: 'test_id',
          value: 'test',
          metadata: { correlationId: 'correlation_id' },
        },
      ])
      const spyResult = await processor.spy.waitForJobWithId(jobIds[0], 'completed')

      expect(spyResult.data).toMatchObject({
        id: 'test_id',
        value: 'test',
        metadata: { correlationId: 'correlation_id' },
      })
      await processor.dispose()
    })
  })

  describe('success', () => {
    const QueueName = 'AbstractBackgroundJobProcessor_success'
    let processor: FakeBackgroundJobProcessor<JobData>

    beforeEach(async () => {
      processor = new FakeBackgroundJobProcessor<JobData>(deps, QueueName, mocks.getRedisConfig())
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

      // @ts-expect-error executing protected method for testing
      const resolvedJob = await processor.queue.getJob(job.id)
      expect(resolvedJob!.data).toMatchObject(jobData)

      // @ts-expect-error executing protected method for testing
      expect(processor.worker.isRunning()).toBe(true)
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

      const jobId = await processor.schedule(jobData)
      const job = await processor.spy.waitForJobWithId(jobId, 'scheduled')
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
        mocks.getRedisConfig(),
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
        mocks.getRedisConfig(),
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
        mocks.getRedisConfig(),
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
      expect(successBackgroundJobProcessor.jobDataResult).toStrictEqual({
        metadata: jobData.metadata,
      })
      expect(job.data).toStrictEqual(jobData)
      expect(successBackgroundJobProcessor.runningPromisesSet).toHaveLength(0)
    })

    it('ignores missing job error during data purging', async () => {
      // Given
      const jobData = {
        id: generateMonotonicUuid(),
        value: 'test',
        metadata: { correlationId: generateMonotonicUuid() },
      }

      const successBackgroundJobProcessor = new TestSuccessBackgroundJobProcessor(
        deps,
        'AbstractBackgroundJobProcessor_purge_missing_job_error',
        mocks.getRedisConfig(),
      )

      const purgePromise = new Promise<void>((resolve) => {
        successBackgroundJobProcessor.onSuccessHook = async (job) => {
          // Dropping the job right before purging will cause a job deleted error during purging.
          await job.remove()
          // Run the purging. It should ignore the error and continue.
          await successBackgroundJobProcessor.purgeJobData(job)
          resolve()
        }
      })

      const jobId = await successBackgroundJobProcessor.schedule(jobData)

      // When
      await successBackgroundJobProcessor.spy.waitForJobWithId(jobId, 'completed')

      // Then
      await expect(purgePromise).resolves.not.toThrow()
      expect(successBackgroundJobProcessor.runningPromisesSet).toHaveLength(0)
    })
  })

  it('throws an error if job data purge fails', async () => {
    // Given
    const jobData = {
      id: generateMonotonicUuid(),
      value: 'test',
      metadata: { correlationId: generateMonotonicUuid() },
    }

    const successBackgroundJobProcessor = new TestSuccessBackgroundJobProcessor(
      deps,
      'AbstractBackgroundJobProcessor_purge_unhandled_error',
      mocks.getRedisConfig(),
    )

    const purgeExecutionPromise = new Promise<void>((resolve) => {
      successBackgroundJobProcessor.onSuccessHook = (job) => {
        // Given
        const jobClearLogsSpy = vi.spyOn(job, 'clearLogs')
        jobClearLogsSpy.mockRejectedValueOnce(new Error('Simulated'))

        // When
        resolve(successBackgroundJobProcessor.purgeJobData(job))
      }
    })

    // When
    await successBackgroundJobProcessor.schedule(jobData)

    // Then
    await expect(purgeExecutionPromise).rejects.toThrow(
      /Job data purge failed: {"type":"Error","message":"Simulated"/,
    )
    expect(successBackgroundJobProcessor.runningPromisesSet).toHaveLength(0)
  })

  describe('error', () => {
    const QueueName = 'AbstractBackgroundJobProcessor_error'
    let processor: TestFailingBackgroundJobProcessor<JobData>

    beforeEach(async () => {
      processor = new TestFailingBackgroundJobProcessor<JobData>(
        deps,
        QueueName,
        mocks.getRedisConfig(),
      )
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
        {
          id: 'test_id',
          value: 'test',
          metadata: { correlationId: 'correlation_id' },
        },
        {
          attempts: 3,
          delay: 0,
        },
      )
      const job = await processor.spy.waitForJobWithId(scheduledJobId, 'failed')

      expect(processor.errorsOnProcess).length(1)
      expect(job.attemptsMade).toBe(3)
      expect(processor.errorsOnProcess[0]).toMatchObject(errors[2])
    })

    it('job throws unrecoverable error at the beginning', async () => {
      const errors = [new UnrecoverableError('unrecoverable test error 1')]
      processor.errorsToThrowOnProcess = errors
      await processor.schedule(
        {
          id: 'test_id',
          value: 'test',
          metadata: { correlationId: 'correlation_id' },
        },
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
        {
          id: 'test_id',
          value: 'test',
          metadata: { correlationId: 'correlation_id' },
        },
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

      const jobId = await processor.schedule(
        {
          id: 'test_id',
          value: 'test',
          metadata: { correlationId: 'correlation_id' },
        },
        {
          attempts: 3,
          delay: 0,
        },
      )

      const job = await processor.spy.waitForJobWithId(jobId, 'failed')

      expect(processor.errorsOnProcess).length(1)
      expect(reportSpy).toHaveBeenCalledWith({
        error: onFailedError,
        context: {
          jobId: job.id,
          jobName: 'AbstractBackgroundJobProcessor_error',
          'x-request-id': 'correlation_id',
          error: expect.stringContaining(onFailedError.message),
        },
      })
    })
  })

  describe('stalled', () => {
    let processor: TestStalledBackgroundJobProcessor

    beforeEach(async () => {
      // @ts-ignore this is intentional
      processor = new TestStalledBackgroundJobProcessor(deps, mocks.getRedisConfig())
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
          jobId,
          jobName: 'TestStalledBackgroundJobProcessor queue',
          'x-request-id': jobData.metadata.correlationId,
          errorJson: expect.stringContaining(onFailedCall.error.message),
        },
      })
    })
  })

  describe('getJobsInStates', () => {
    const QueueName = 'AbstractBackgroundJobProcessor_getJobsInStates'
    let processor: FakeBackgroundJobProcessor<JobData>

    beforeEach(async () => {
      processor = new FakeBackgroundJobProcessor<JobData>(deps, QueueName, mocks.getRedisConfig())
      await processor.start()
    })

    afterEach(async () => {
      await processor.dispose()
    })

    it('empty states should throw error', async () => {
      await expect(processor.getJobsInQueue([])).rejects.toThrow('states must not be empty')
    })

    it('start bigger than end should throw error', async () => {
      await expect(processor.getJobsInQueue(['active'], 2, 1)).rejects.toThrow(
        'start must be less than or equal to end',
      )
    })

    it('returns jobs in the given states', async () => {
      const jobIds = await processor.scheduleBulk(
        [
          {
            id: generateMonotonicUuid(),
            value: 'test1',
            metadata: { correlationId: generateMonotonicUuid() },
          },
          {
            id: generateMonotonicUuid(),
            value: 'test2',
            metadata: { correlationId: generateMonotonicUuid() },
          },
          {
            id: generateMonotonicUuid(),
            value: 'test3',
            metadata: { correlationId: generateMonotonicUuid() },
          },
        ],
        { delay: 1000 },
      )

      const jobs1 = await processor.getJobsInQueue(['delayed'])
      expect(jobs1).toMatchObject({
        jobs: expect.arrayContaining(jobIds.map((id) => expect.objectContaining({ id }))),
        hasMore: false,
      })
      expect(jobs1.jobs.map((e) => e.id)).toEqual(jobIds) // order is respected - by default asc

      const jobs2 = await processor.getJobsInQueue(['delayed'], 0, 0)
      expect(jobs2).toMatchObject({
        jobs: expect.arrayContaining([expect.objectContaining({ id: jobIds[0] })]),
        hasMore: true,
      })

      const jobs3 = await processor.getJobsInQueue(['delayed'], 0, 1, false)
      expect(jobs3).toMatchObject({
        jobs: expect.arrayContaining([
          expect.objectContaining({ id: jobIds[2] }),
          expect.objectContaining({ id: jobIds[1] }),
        ]),
        hasMore: true,
      })

      const jobs4 = await processor.getJobsInQueue(['delayed'], 1, 2)
      expect(jobs4).toMatchObject({
        jobs: expect.arrayContaining([
          expect.objectContaining({ id: jobIds[1] }),
          expect.objectContaining({ id: jobIds[2] }),
        ]),
        hasMore: false,
      })
    })
  })

  describe('getJobCount', () => {
    it('lazy init + job count works as expected', async () => {
      const processor = new FakeBackgroundJobProcessor<JobData>(
        deps,
        'queue1',
        mocks.getRedisConfig(),
      )
      // lazy init
      expect(await processor.getJobCount()).toBe(0)

      const jobId = await processor.schedule({
        id: 'test_id',
        value: 'test',
        metadata: { correlationId: 'correlation_id' },
      })

      expect(await processor.getJobCount()).toBe(1)
      await processor.spy.waitForJobWithId(jobId, 'completed')
      expect(await processor.getJobCount()).toBe(0)

      await processor.dispose()
    })
  })

  describe('repeatable', () => {
    beforeEach(async () => {
      await redis?.del(QUEUE_IDS_KEY)
    })

    it('schedules repeatable job', async () => {
      const processor = new FakeBackgroundJobProcessor<JobData>(
        deps,
        'queue1',
        mocks.getRedisConfig(),
      )

      const scheduledJobId = await processor.schedule(
        {
          id: 'test_id',
          value: 'test',
          metadata: { correlationId: 'correlation_id' },
        },
        {
          repeat: {
            every: 10,
            immediately: true,
            limit: 5,
          },
        },
      )

      await processor.spy.waitForJobWithId(scheduledJobId, 'completed')
      // @ts-expect-error executing protected method for testing
      const repeatableJobs = await processor.queue.getRepeatableJobs()
      expect(repeatableJobs).toHaveLength(1)
      expect(repeatableJobs[0].every).toBe('10')

      await processor.dispose()
    })
  })
})
