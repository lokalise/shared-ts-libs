import { generateMonotonicUuid } from '@lokalise/id-utils'
import { waitAndRetry } from '@lokalise/node-core'
import { UnrecoverableError } from 'bullmq'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DependencyMocks } from '../../../test/dependencyMocks.js'
import type { BaseJobPayload } from '../types.js'

import { randomUUID } from 'node:crypto'
import type Redis from 'ioredis'
import { isPromiseFinished } from '../../../test/isPromiseFinished.js'
import { TestFailingUpdatedBackgroundJobProcessor } from '../../../test/processors/TestFailingUpdatedBackgroundJobProcessor.js'
import { TestStalledUpdatedBackgroundJobProcessor } from '../../../test/processors/TestStalledUpdatedBackgroundJobProcessor.js'
import { TestSuccessUpdatedBackgroundJobProcessor } from '../../../test/processors/TestSuccessUpdatedBackgroundJobProcessor.js'
import { FakeQueueManager } from '../managers/FakeQueueManager.js'
import type { QueueConfiguration } from '../managers/QueueManager.js'
import { FakeUpdatedBackgroundJobProcessor } from './FakeUpdatedBackgroundJobProcessor.js'
import type { BackgroundJobProcessorDependencies } from './types.js'

type JobData = {
  id: string
  value: string
} & BaseJobPayload

const QUEUE_IDS_KEY = 'background-jobs-common:background-job:queues'

describe('AbstractBackgroundJobProcessor', () => {
  let mocks: DependencyMocks
  let deps: BackgroundJobProcessorDependencies<JobData, void>
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
      const job1 = new FakeUpdatedBackgroundJobProcessor<JobData>(
        deps,
        'queue1',
        mocks.getRedisConfig(),
      )
      const job2 = new FakeUpdatedBackgroundJobProcessor<JobData>(
        deps,
        'queue2',
        mocks.getRedisConfig(),
      )

      await job1.start()
      await job2.start()
      await expect(
        new FakeUpdatedBackgroundJobProcessor<JobData>(
          deps,
          'queue1',
          mocks.getRedisConfig(),
        ).start(),
      ).rejects.toThrowError(/Queue id "queue1" is not unique/)

      await job1.dispose()
      await job2.dispose()
    })

    it('Multiple start calls (sequential or concurrent) not produce errors', async () => {
      const redisConfig = mocks.getRedisConfig()
      const processor = new FakeUpdatedBackgroundJobProcessor<JobData>(deps, 'queue1', redisConfig)

      // sequential start calls
      await expect(processor.start()).resolves.not.toThrowError()
      await expect(processor.start()).resolves.not.toThrowError()
      await processor.dispose()

      // concurrent start calls
      await expect(Promise.all([processor.start(), processor.start()])).resolves.not.toThrowError()
      await processor.dispose()
    })

    it('restart processor after dispose', async () => {
      const queueId = randomUUID()

      const jobData = {
        id: generateMonotonicUuid(),
        value: 'test',
        metadata: { correlationId: generateMonotonicUuid() },
      }

      const processor = new FakeUpdatedBackgroundJobProcessor<JobData>(
        deps,
        queueId,
        mocks.getRedisConfig(),
      )
      await processor.start()

      const queueManager = new FakeQueueManager([
        {
          queueId,
          redisConfig: mocks.getRedisConfig(),
        },
      ])
      await queueManager.start()

      const jobId = await queueManager.schedule(queueId, jobData, { delay: 100 })

      const jobScheduled = await queueManager.spy.waitForJobWithId(jobId, 'scheduled')
      expect(jobScheduled.data, 'object did not match').toMatchObject(jobData)

      await processor.dispose()
      const completedPromise = processor.spy.waitForJobWithId(jobId, 'completed')
      await expect(isPromiseFinished(completedPromise)).resolves.toBe(false)

      await processor.start()
      await expect(isPromiseFinished(completedPromise)).resolves.toBe(true)

      await processor.dispose()
      await queueManager.dispose()
    })

    it('processors starts queue but not worker if workerAutoRunEnabled is true', async () => {
      const queueId = randomUUID()
      const processor = new FakeUpdatedBackgroundJobProcessor<JobData>(
        deps,
        queueId,
        mocks.getRedisConfig(),
        true,
        false,
      )
      await processor.start()

      const queueManager = new FakeQueueManager([
        {
          queueId,
          redisConfig: mocks.getRedisConfig(),
        },
      ])
      await queueManager.start()

      // Worker is instantiated but not running
      // @ts-expect-error executing protected method for testing
      expect(processor.worker.isRunning()).toBeFalsy()

      const jobData = {
        id: 'test_id',
        value: 'test',
        metadata: { correlationId: 'correlation_id' },
      }
      const jobId = await queueManager.schedule(queueId, jobData)

      // Job is added to the queue but not processed by the worker
      const queueManagerSpyResult = await queueManager.spy.waitForJobWithId(jobId, 'scheduled')
      expect(queueManagerSpyResult.data).toMatchObject(jobData)

      const promise = processor.spy.waitForJobWithId(jobId, 'completed')
      setTimeout(async () => {
        await expect(isPromiseFinished(promise)).resolves.toBe(false)
        // @ts-expect-error executing protected method for testing
        expect(processor.worker.isRunning()).toBe(false)
      }, 200)

      await processor.dispose()
      await queueManager.dispose()
    })
  })

  describe('success', () => {
    let queueId: string
    let unusedQueueId: string
    let processor: FakeUpdatedBackgroundJobProcessor<JobData>
    let queueManager: FakeQueueManager<QueueConfiguration[]>

    beforeEach(async () => {
      queueId = randomUUID()
      unusedQueueId = 'unusedQueueId'

      processor = new FakeUpdatedBackgroundJobProcessor<JobData>(
        deps,
        queueId,
        mocks.getRedisConfig(),
      )
      await processor.start()

      queueManager = new FakeQueueManager([
        {
          queueId,
          redisConfig: mocks.getRedisConfig(),
        },
        {
          queueId: unusedQueueId,
          redisConfig: mocks.getRedisConfig(),
        },
      ])
      await queueManager.start()
    })

    afterEach(async () => {
      await processor.dispose()
      await queueManager.dispose()
    })

    it('runs the job with autogenerated id', async () => {
      // Given
      const jobData = {
        id: generateMonotonicUuid(),
        value: 'test',
        metadata: { correlationId: generateMonotonicUuid() },
      }

      // When
      const jobId = await queueManager.schedule(queueId, jobData)

      // Then
      const UUID_REGEX =
        /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/
      expect(UUID_REGEX.test(jobId)).toBe(true)

      const job = await processor.spy.waitForJobWithId(jobId, 'completed')
      expect(job.data).toMatchObject(jobData)

      // @ts-ignore
      const resolvedJob = await queueManager.getQueue(queueId).getJob(job.id)
      expect(resolvedJob!.data).toMatchObject(jobData)

      // @ts-expect-error executing protected method for testing
      expect(processor.worker.isRunning()).toBe(true)
    })

    it('schedules and runs multiple jobs', async () => {
      // Given - When
      const scheduledJobIds = await queueManager.scheduleBulk(queueId, [
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

    it('should trigger onSuccess hook', async () => {
      // Given
      const jobData = {
        id: generateMonotonicUuid(),
        value: 'test',
        metadata: { correlationId: generateMonotonicUuid() },
      }

      const successBackgroundJobProcessor = new TestSuccessUpdatedBackgroundJobProcessor(
        deps,
        unusedQueueId,
        mocks.getRedisConfig(),
      )

      await successBackgroundJobProcessor.start()
      const jobId = await queueManager.schedule(unusedQueueId, jobData)

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

      const successBackgroundJobProcessor = new TestSuccessUpdatedBackgroundJobProcessor(
        deps,
        unusedQueueId,
        mocks.getRedisConfig(),
      )
      successBackgroundJobProcessor.onSuccessHook = () => {
        throw new Error('onSuccessError')
      }

      await successBackgroundJobProcessor.start()
      const jobId = await queueManager.schedule(unusedQueueId, jobData)

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

      const successBackgroundJobProcessor = new TestSuccessUpdatedBackgroundJobProcessor(
        deps,
        unusedQueueId,
        mocks.getRedisConfig(),
      )
      successBackgroundJobProcessor.onSuccessHook = (job) => {
        void successBackgroundJobProcessor.purgeJobData(job)
      }

      await successBackgroundJobProcessor.start()
      const jobId = await queueManager.schedule(unusedQueueId, jobData)

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

      const successBackgroundJobProcessor = new TestSuccessUpdatedBackgroundJobProcessor(
        deps,
        unusedQueueId,
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

      await successBackgroundJobProcessor.start()
      const jobId = await queueManager.schedule(unusedQueueId, jobData)

      // When
      await successBackgroundJobProcessor.spy.waitForJobWithId(jobId, 'completed')

      // Then
      await expect(purgePromise).resolves.not.toThrow()
      expect(successBackgroundJobProcessor.runningPromisesSet).toHaveLength(0)

      await successBackgroundJobProcessor.dispose()
    })

    it('throws an error if job data purge fails', async () => {
      // Given
      const jobData = {
        id: generateMonotonicUuid(),
        value: 'test',
        metadata: { correlationId: generateMonotonicUuid() },
      }

      const successBackgroundJobProcessor = new TestSuccessUpdatedBackgroundJobProcessor(
        deps,
        unusedQueueId,
        mocks.getRedisConfig(),
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
      await queueManager.schedule(unusedQueueId, jobData)

      // Then
      await expect(purgeExecutionPromise).rejects.toThrowError(
        /Job data purge failed: {"type":"Error","message":"Simulated"/,
      )
      expect(successBackgroundJobProcessor.runningPromisesSet).toHaveLength(0)

      await successBackgroundJobProcessor.dispose()
    })
  })

  describe('error', () => {
    const queueId = 'AbstractBackgroundJobProcessor_error'
    let processor: TestFailingUpdatedBackgroundJobProcessor<JobData>
    let queueManager: FakeQueueManager<QueueConfiguration[]>

    beforeEach(async () => {
      processor = new TestFailingUpdatedBackgroundJobProcessor<JobData>(
        deps,
        queueId,
        mocks.getRedisConfig(),
      )
      await processor.start()

      queueManager = new FakeQueueManager([
        {
          queueId,
          redisConfig: mocks.getRedisConfig(),
        },
      ])
      await queueManager.start()
    })

    afterEach(async () => {
      await processor.dispose()
      await queueManager.dispose()
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
      const scheduledJobId = await queueManager.schedule(
        queueId,
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
      expect(processor.errorsOnProcess[0]).toMatchObject(errors[2])
    })

    it('job throws unrecoverable error at the beginning', async () => {
      // Given
      const errors = [new UnrecoverableError('unrecoverable test error 1')]
      processor.errorsToThrowOnProcess = errors

      // When
      const jobId = await queueManager.schedule(
        queueId,
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
      expect(processor.errorsOnProcess[0]).toMatchObject(errors[0])
    })

    it('job throws unrecoverable error in the middle', async () => {
      // Given
      const errors = [
        new Error('normal test error 1'),
        new UnrecoverableError('unrecoverable test error 2'),
      ]
      processor.errorsToThrowOnProcess = errors

      // When
      const jobId = await queueManager.schedule(
        queueId,
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
      expect(processor.errorsOnProcess[0]).toMatchObject(errors[1])
    })

    it('error is triggered on failed hook', async () => {
      // Given
      const onFailedError = new Error('onFailed error')
      processor.errorToThrowOnFailed = onFailedError
      processor.errorsToThrowOnProcess = [new UnrecoverableError('unrecoverable error')]

      const reportSpy = vi.spyOn(deps.errorReporter, 'report')

      // When
      const jobId = await queueManager.schedule(
        queueId,
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
  })

  describe('stalled', () => {
    const queueId = 'stalledQueue'
    let stalledProcessor: TestStalledUpdatedBackgroundJobProcessor<JobData>
    let queueManager: FakeQueueManager<QueueConfiguration[]>

    beforeEach(async () => {
      stalledProcessor = new TestStalledUpdatedBackgroundJobProcessor(
        deps,
        queueId,
        mocks.getRedisConfig(),
      )
      await stalledProcessor.start()

      queueManager = new FakeQueueManager(
        [
          {
            queueId,
            redisConfig: mocks.getRedisConfig(),
          },
        ],
        {
          isTest: false,
        },
      )
      await queueManager.start()
    })

    afterEach(async () => {
      await stalledProcessor.dispose()
      await queueManager.dispose()
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
      const jobId = await queueManager.schedule(queueId, jobData, {
        attempts: 1,
        backoff: { type: 'fixed', delay: 1 },
        removeOnComplete: true,
        removeOnFail: 1, // we should keep the job in the queue to test the stalled job behavior
      })

      // Then
      await waitAndRetry(() => stalledProcessor.onFailedErrors.length > 0, 100, 20)
      expect(stalledProcessor?.onFailedErrors).length(1)

      const onFailedCall = stalledProcessor?.onFailedErrors[0]
      expect(onFailedCall.error.message).toBe('job stalled more than allowable limit')
      expect(onFailedCall.job.id).toBe(jobId)
      expect(onFailedCall.job.data.id).toBe(jobData.id)
      expect(onFailedCall.job.attemptsMade).toBe(0)

      expect(errorReporterSpy).toHaveBeenCalledWith({
        error: onFailedCall.error,
        context: {
          jobId,
          jobName: queueId,
          'x-request-id': jobData.metadata.correlationId,
          errorJson: expect.stringContaining(onFailedCall.error.message),
        },
      })
    })
  })

  describe('repeatable', () => {
    beforeEach(async () => {
      await redis?.del(QUEUE_IDS_KEY)
    })

    it('schedules repeatable job', async () => {
      // Given
      const queueId = randomUUID()
      const processor = new FakeUpdatedBackgroundJobProcessor<JobData>(
        deps,
        queueId,
        mocks.getRedisConfig(),
      )
      await processor.start()
      const queueManager = new FakeQueueManager([
        {
          queueId,
          redisConfig: mocks.getRedisConfig(),
        },
      ])
      await queueManager.start()

      // When
      const scheduledJobId = await queueManager.schedule(
        queueId,
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

      const schedulers = await queueManager.getQueue(queueId).getJobSchedulers()
      expect(schedulers).toHaveLength(1)
      expect(schedulers[0].every).toBe('10')

      await processor.dispose()
    })
  })
})
