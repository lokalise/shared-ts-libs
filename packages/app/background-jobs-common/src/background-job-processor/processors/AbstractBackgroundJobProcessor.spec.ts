import { generateMonotonicUuid } from '@lokalise/id-utils'
import { waitAndRetry } from '@lokalise/node-core'
import { UnrecoverableError } from 'bullmq'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TestDependencyFactory } from '../../../test/TestDependencyFactory.ts'
import { TestFailingBackgroundJobProcessor } from '../../../test/processors/TestFailingBackgroundJobProcessor.ts'
import { TestStalledBackgroundJobProcessor } from '../../../test/processors/TestStalledBackgroundJobProcessor.ts'
import { TestSuccessBackgroundJobProcessor } from '../../../test/processors/TestSuccessBackgroundJobProcessor.ts'
import type { BaseJobPayload } from '../types.ts'

import { randomUUID } from 'node:crypto'
import { TestBackgroundJobProcessorWithLazyLoading } from '../../../test/processors/TestBackgroundJobProcessorWithLazyLoading.ts'
import { MutedUnrecoverableError } from '../errors/MutedUnrecoverableError.ts'
import { FakeBackgroundJobProcessor } from './FakeBackgroundJobProcessor.ts'
import type { BackgroundJobProcessorDependencies } from './types.ts'
import { TestBasicBackgroundJobProcessor } from '../../../test/processors/TestBasicBackgroundJobProcessor.ts'

type JobData = {
  id: string
  value: string
} & BaseJobPayload

describe('AbstractBackgroundJobProcessor', () => {
  let factory: TestDependencyFactory
  let deps: BackgroundJobProcessorDependencies<JobData, any>

  beforeEach(async () => {
    factory = new TestDependencyFactory()
    deps = factory.create()

    await factory.clearRedis()
  })

  afterEach(async () => {
    await factory.dispose()
  })

  describe('start', () => {
    it('throws an error if queue id is not unique', async () => {
      const job1 = new FakeBackgroundJobProcessor<JobData>(deps, 'queue1', factory.getRedisConfig())
      const job2 = new FakeBackgroundJobProcessor<JobData>(deps, 'queue2', factory.getRedisConfig())

      await job1.start()
      await job2.start()
      await expect(
        new FakeBackgroundJobProcessor<JobData>(deps, 'queue1', factory.getRedisConfig()).start(),
      ).rejects.toMatchInlineSnapshot('[Error: Processor for queue id "queue1" is not unique.]')

      await job1.dispose()
      await job2.dispose()
    })

    it('Multiple start calls (sequential or concurrent) not produce errors', async () => {
      const redisConfig = factory.getRedisConfig()
      const processor = new FakeBackgroundJobProcessor<JobData>(deps, 'queue1', redisConfig)

      // sequential start calls
      await expect(processor.start()).resolves.not.toThrowError()
      await expect(processor.start()).resolves.not.toThrowError()
      await processor.dispose()

      // concurrent start calls
      await expect(Promise.all([processor.start(), processor.start()])).resolves.not.toThrowError()
      await processor.dispose()
    })

    it('throw error if try to schedule job without starting processor and lazy init disabled', async () => {
      const processor = new FakeBackgroundJobProcessor<JobData>(
        deps,
        'queue1',
        factory.getRedisConfig(),
      )

      await expect(
        processor.schedule({
          id: 'test_id',
          value: 'test',
          metadata: { correlationId: 'correlation_id' },
        }),
      ).rejects.toThrowError(/Processor not started, please call `start` or enable lazy init/)
    })

    it('lazy loading on schedule', async () => {
      const processor = new TestBackgroundJobProcessorWithLazyLoading<JobData>(
        deps,
        factory.getRedisConfig(),
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
      const processor = new TestBackgroundJobProcessorWithLazyLoading<JobData>(
        deps,
        factory.getRedisConfig(),
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

    it('restart processor after dispose', async () => {
      const processor = new FakeBackgroundJobProcessor<JobData>(
        deps,
        randomUUID(),
        factory.getRedisConfig(),
      )

      await processor.start()
      // @ts-expect-error executing protected method for testing
      expect(processor.worker.isRunning()).toBeTruthy()

      await processor.dispose()
      // @ts-expect-error executing protected method for testing
      expect(processor.worker.isRunning()).toBeFalsy()

      await processor.start()
      // @ts-expect-error executing protected method for testing
      expect(processor.worker.isRunning()).toBeTruthy()

      await processor.dispose()
    })

    it('processors starts queue but not worker if workerAutoRunEnabled is true', async () => {
      const processor = new FakeBackgroundJobProcessor<JobData>(
        deps,
        randomUUID(),
        factory.getRedisConfig(),
        true,
        false,
      )
      await processor.start()

      // Worker is instantiated but not running
      // @ts-expect-error executing protected method for testing
      expect(processor.worker.isRunning()).toBeFalsy()

      const jobData = {
        id: 'test_id',
        value: 'test',
        metadata: { correlationId: 'correlation_id' },
      }
      const jobId = await processor.schedule(jobData)

      // Job is added to the queue but not processed by the worker
      const spyResult = await processor.spy.waitForJobWithId(jobId, 'scheduled')
      expect(spyResult.data).toMatchObject(jobData)

      await processor.dispose()
    })

    it('should use bull queue name with prefixes for grouping', async () => {
      const processor = new TestBasicBackgroundJobProcessor<JobData>(deps, {
        queueId: 'my-queue',
        redisConfig: factory.getRedisConfig(),
        bullDashboardGrouping: ['prefix1', 'prefix2'],
      })
      await processor.start()

      // @ts-expect-error executing protected method for testing
      expect(processor.queue.name).toBe('prefix1.prefix2.my-queue')
      // @ts-expect-error executing protected method for testing
      expect(processor.worker.name).toBe('prefix1.prefix2.my-queue')

      await processor.dispose()
    })
  })

  describe('success', () => {
    let processor: TestBasicBackgroundJobProcessor<JobData>

    beforeEach(async () => {
      processor = new TestBasicBackgroundJobProcessor<JobData>(deps, {
        queueId: randomUUID(),
        redisConfig: factory.getRedisConfig(),
      })
      await processor.start()
    })

    afterEach(async () => {
      await processor.dispose()
    })

    it('runs the job with autogenerated id', async () => {
      // Given
      const jobData = {
        id: generateMonotonicUuid(),
        value: 'test',
        metadata: { correlationId: generateMonotonicUuid() },
      }

      // When
      const jobId = await processor.schedule(jobData)

      // Then
      const UUID_REGEX =
        /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/
      expect(UUID_REGEX.test(jobId)).toBe(true)

      const job = await processor.spy.waitForJobWithId(jobId, 'completed')
      expect(job.data).toMatchObject(jobData)

      // @ts-expect-error executing protected method for testing
      const resolvedJob = await processor.queue.getJob(job.id)
      expect(resolvedJob!.data).toMatchObject(jobData)

      // @ts-expect-error executing protected method for testing
      expect(processor.worker.isRunning()).toBe(true)
    })

    it('schedules and runs multiple jobs', async () => {
      // Given - When
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

      // Then
      expect(scheduledJobIds.length).toBe(2)

      const firstJob = await processor.spy.waitForJobWithId(scheduledJobIds[0], 'completed')
      const secondJob = await processor.spy.waitForJobWithId(scheduledJobIds[1], 'completed')

      expect(firstJob.data.value).toBe('first')
      expect(secondJob.data.value).toBe('second')
    })

    it('should not fail if scheduleBulk is called with an empty array', async () => {
      await expect(processor.scheduleBulk([])).resolves.toHaveLength(0)
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
        factory.getRedisConfig(),
      )

      await successBackgroundJobProcessor.start()
      const jobId = await successBackgroundJobProcessor.schedule(jobData)

      const job = await successBackgroundJobProcessor.spy.waitForJobWithId(jobId, 'completed')
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
        factory.getRedisConfig(),
      )
      successBackgroundJobProcessor.onSuccessHook = () => {
        throw new Error('onSuccessError')
      }

      await successBackgroundJobProcessor.start()
      const jobId = await successBackgroundJobProcessor.schedule(jobData)

      const job = await successBackgroundJobProcessor.spy.waitForJobWithId(jobId, 'completed')
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
        factory.getRedisConfig(),
      )
      successBackgroundJobProcessor.onSuccessHook = (job) => {
        void successBackgroundJobProcessor.purgeJobData(job)
      }

      await successBackgroundJobProcessor.start()
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
        factory.getRedisConfig(),
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

      await successBackgroundJobProcessor.start()
      const jobId = await successBackgroundJobProcessor.schedule(jobData)

      // When
      await successBackgroundJobProcessor.spy.waitForJobWithId(jobId, 'completed')

      // Then
      await expect(purgePromise).resolves.not.toThrow()
      expect(successBackgroundJobProcessor.runningPromisesSet).toHaveLength(0)
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
        factory.getRedisConfig(),
      )

      const purgeExecutionPromise = new Promise<void>((resolve) => {
        successBackgroundJobProcessor.onSuccessHook = (job) => {
          const jobClearLogsSpy = vi.spyOn(job, 'clearLogs')
          jobClearLogsSpy.mockRejectedValueOnce(new Error('Simulated'))
          resolve(successBackgroundJobProcessor.purgeJobData(job))
        }
      })

      // When
      await successBackgroundJobProcessor.start()
      await successBackgroundJobProcessor.schedule(jobData)

      // Then
      await expect(purgeExecutionPromise).rejects.toThrowError(
        /Job data purge failed: {"type":"Error","message":"Simulated"/,
      )
      expect(successBackgroundJobProcessor.runningPromisesSet).toHaveLength(0)
    })
  })

  describe('using grouping', () => {
    let processor: TestBasicBackgroundJobProcessor<JobData>

    beforeEach(async () => {
      processor = new TestBasicBackgroundJobProcessor<JobData>(deps, {
        queueId: randomUUID(),
        redisConfig: factory.getRedisConfig(),
        bullDashboardGrouping: ['my-prefix'],
      })
      await processor.start()
    })

    afterEach(async () => {
      await processor.dispose()
    })

    it('should work with single schedule', async () => {
      // Given
      const jobData = {
        id: generateMonotonicUuid(),
        value: 'test',
        metadata: { correlationId: generateMonotonicUuid() },
      }

      // When
      const jobId = await processor.schedule(jobData)

      // Then
      const job = await processor.spy.waitForJobWithId(jobId, 'completed')
      expect(job.data).toMatchObject(jobData)
    })

    it('should work with scheduleBulk', async () => {
      // Given - When
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

      // Then
      expect(scheduledJobIds.length).toBe(2)

      const firstJob = await processor.spy.waitForJobWithId(scheduledJobIds[0], 'completed')
      const secondJob = await processor.spy.waitForJobWithId(scheduledJobIds[1], 'completed')

      expect(firstJob.data.value).toBe('first')
      expect(secondJob.data.value).toBe('second')
    })
  })

  describe('error', () => {
    const QueueName = 'AbstractBackgroundJobProcessor_error'
    let processor: TestFailingBackgroundJobProcessor<JobData>

    beforeEach(async () => {
      processor = new TestFailingBackgroundJobProcessor<JobData>(
        deps,
        QueueName,
        factory.getRedisConfig(),
      )
      await processor.start()
    })

    afterEach(async () => {
      await processor.dispose()
    })

    it('job is throwing normal errors', async () => {
      // Given
      const errors = [
        new Error('normal test error 1'),
        new Error('normal test error 2'),
        new Error('normal test error 3'),
      ]
      processor.errorsToThrowOnProcess = errors

      // When
      const scheduledJobId = await processor.schedule(
        {
          id: 'test_id',
          value: 'test',
          metadata: { correlationId: 'correlation_id' },
        },
        { attempts: 3, delay: 0 },
      )

      // Then
      const job = await processor.spy.waitForJobWithId(scheduledJobId, 'failed')

      expect(processor.errorsOnProcess).length(1)
      expect(job.attemptsMade).toBe(3)
      expect(processor.errorsOnProcess[0]).toMatchObject(errors[2]!)
    })

    it('job throws unrecoverable error at the beginning', async () => {
      // Given
      const errors = [new UnrecoverableError('unrecoverable test error 1')]
      processor.errorsToThrowOnProcess = errors

      // When
      const jobId = await processor.schedule(
        {
          id: 'test_id',
          value: 'test',
          metadata: { correlationId: 'correlation_id' },
        },
        { attempts: 3, delay: 0 },
      )

      // Then
      const job = await processor.spy.waitForJobWithId(jobId, 'failed')

      expect(processor.errorsOnProcess).length(1)
      expect(job.attemptsMade).toBe(1)
      expect(processor.errorsOnProcess[0]).toMatchObject(errors[0]!)
    })

    it('job throws unrecoverable error in the middle', async () => {
      // Given
      const errors = [
        new Error('normal test error 1'),
        new UnrecoverableError('unrecoverable test error 2'),
      ]
      processor.errorsToThrowOnProcess = errors

      // When
      const jobId = await processor.schedule(
        {
          id: 'test_id',
          value: 'test',
          metadata: { correlationId: 'correlation_id' },
        },
        { attempts: 3, delay: 0 },
      )

      // Then
      const job = await processor.spy.waitForJobWithId(jobId, 'failed')

      expect(processor.errorsOnProcess).length(1)
      expect(job.attemptsMade).toBe(2)
      expect(processor.errorsOnProcess[0]).toMatchObject(errors[1]!)
    })

    it('error is triggered on failed hook', async () => {
      // Given
      const onFailedError = new Error('onFailed error')
      processor.errorToThrowOnFailed = onFailedError
      processor.errorsToThrowOnProcess = [new UnrecoverableError('unrecoverable error')]

      const reportSpy = vi.spyOn(deps.errorReporter, 'report')

      // When
      const jobId = await processor.schedule(
        {
          id: 'test_id',
          value: 'test',
          metadata: { correlationId: 'correlation_id' },
        },
        { attempts: 3, delay: 0 },
      )

      // Then
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

    it('job throws muted unrecoverable error and it is not reported', async () => {
      // Given
      const errorReporterSpy = vi.spyOn(deps.errorReporter, 'report')

      const errors = [new MutedUnrecoverableError('muted unrecoverable test error')]
      processor.errorsToThrowOnProcess = errors

      // When
      const jobId = await processor.schedule(
        {
          id: 'test_id',
          value: 'test',
          metadata: { correlationId: 'correlation_id' },
        },
        { attempts: 3, delay: 0 },
      )

      // Then
      const job = await processor.spy.waitForJobWithId(jobId, 'failed')

      expect(processor.errorsOnProcess).length(1)
      expect(job.attemptsMade).toBe(1)
      expect(processor.errorsOnProcess[0]).toMatchObject(errors[0]!)
      expect(errorReporterSpy).toHaveBeenCalledTimes(0)
    })
  })

  describe('stalled', () => {
    let stalledProcessor: TestStalledBackgroundJobProcessor<JobData>

    beforeEach(async () => {
      stalledProcessor = new TestStalledBackgroundJobProcessor(deps, factory.getRedisConfig())
      await stalledProcessor.start()
    })

    afterEach(async () => {
      await stalledProcessor.dispose()
    })

    it('handling stalled errors', async () => {
      // Given
      const errorReporterSpy = vi.spyOn(deps.errorReporter, 'report')

      // When
      const jobData = {
        id: generateMonotonicUuid(),
        value: 'test',
        metadata: { correlationId: generateMonotonicUuid() },
      }
      const jobId = await stalledProcessor.schedule(jobData)

      // Then
      await waitAndRetry(() => stalledProcessor.onFailedErrors.length > 0, 100, 20)
      expect(stalledProcessor?.onFailedErrors).length(1)

      const onFailedCall = stalledProcessor?.onFailedErrors[0]
      expect(onFailedCall!.error.message).toBe('job stalled more than allowable limit')
      expect(onFailedCall!.job.id).toBe(jobId)
      expect(onFailedCall!.job.data.id).toBe(jobData.id)
      expect(onFailedCall!.job.attemptsMade).toBe(0)

      expect(errorReporterSpy).toHaveBeenCalledWith({
        error: onFailedCall!.error,
        context: {
          jobId,
          jobName: 'TestStalledBackgroundJobProcessor queue',
          'x-request-id': jobData.metadata.correlationId,
          errorJson: expect.stringContaining(onFailedCall!.error.message),
        },
      })
    })
  })

  describe('getJobsInStates', () => {
    const QueueName = 'AbstractBackgroundJobProcessor_getJobsInStates'
    let processor: FakeBackgroundJobProcessor<JobData>

    beforeEach(async () => {
      processor = new FakeBackgroundJobProcessor<JobData>(
        deps,
        QueueName,
        factory.getRedisConfig(),
        false,
      )
      await processor.start()
    })

    afterEach(async () => {
      await processor.dispose()
    })

    it('empty states should throw error', async () => {
      await expect(processor.getJobsInQueue([])).rejects.toThrowError('states must not be empty')
    })

    it('start bigger than end should throw error', async () => {
      await expect(processor.getJobsInQueue(['active'], 2, 1)).rejects.toThrowError(
        'start must be less than or equal to end',
      )
    })

    it('returns jobs in the given states', async () => {
      // Given - When
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

      // Then
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
    it('job count works as expected', async () => {
      // Given
      const processor = new FakeBackgroundJobProcessor<JobData>(
        deps,
        'queue1',
        factory.getRedisConfig(),
      )
      await processor.start()
      expect(await processor.getJobCount()).toBe(0)

      // When
      const jobId = await processor.schedule({
        id: 'test_id',
        value: 'test',
        metadata: { correlationId: 'correlation_id' },
      })

      // Then
      expect(await processor.getJobCount()).toBe(1)
      await processor.spy.waitForJobWithId(jobId, 'completed')
      expect(await processor.getJobCount()).toBe(0)

      await processor.dispose()
    })
  })

  describe('repeatable', () => {
    it('schedules repeatable job', async () => {
      // Given
      const processor = new FakeBackgroundJobProcessor<JobData>(
        deps,
        'queue1',
        factory.getRedisConfig(),
      )

      await processor.start()

      // When
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

      // Then
      await processor.spy.waitForJobWithId(scheduledJobId, 'completed')
      // @ts-expect-error executing protected method for testing
      const repeatableJobs = await processor.queue.getRepeatableJobs()
      expect(repeatableJobs).toHaveLength(1)
      expect(repeatableJobs[0]!.every).toBe('10')

      await processor.dispose()
    })
  })
})
