import { generateMonotonicUuid } from '@lokalise/id-utils'
import { type CommonLogger, waitAndRetry } from '@lokalise/node-core'
import { UnrecoverableError } from 'bullmq'
import { symbols } from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DependencyMocks, lastInfoSpy } from '../../../test/dependencyMocks'
import { TestFailingBackgroundJobProcessor } from '../../../test/processors/TestFailingBackgroundJobProcessor'
import { TestStalledBackgroundJobProcessor } from '../../../test/processors/TestStalledBackgroundJobProcessor'
import { TestSuccessBackgroundJobProcessor } from '../../../test/processors/TestSucessBackgroundJobProcessor'
import { RETENTION_QUEUE_IDS_IN_DAYS } from '../constants'
import type { BaseJobPayload } from '../types'
import { daysToMilliseconds } from '../utils'

import Redis from 'ioredis'
import { getSanitizedTestRedisConfig, getTestRedisConfig } from '../../../test/setup'
import { AbstractBackgroundJobProcessor } from './AbstractBackgroundJobProcessor'
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

  beforeEach(async () => {
    mocks = new DependencyMocks()
    deps = mocks.create()

    await deps.redis?.flushall('SYNC')
  })

  afterEach(async () => {
    await mocks.dispose()
  })

  describe('getActiveQueueIds', () => {
    beforeEach(async () => {
      await deps.redis?.del(QUEUE_IDS_KEY)
    })

    it('returns not expired elements on the set', async () => {
      const retentionMs = daysToMilliseconds(RETENTION_QUEUE_IDS_IN_DAYS)

      const redisWithoutPrefix = new Redis(getSanitizedTestRedisConfig())
      await redisWithoutPrefix.zadd(QUEUE_IDS_KEY, Date.now() - retentionMs, 'expired')
      await redisWithoutPrefix.zadd(QUEUE_IDS_KEY, Date.now(), 'queue2')
      await redisWithoutPrefix.zadd(QUEUE_IDS_KEY, Date.now() - retentionMs + 100, 'queue1')
      redisWithoutPrefix.disconnect()

      const queues = await AbstractBackgroundJobProcessor.getActiveQueueIds(
        getSanitizedTestRedisConfig(),
      )
      expect(queues).toEqual(['queue1', 'queue2'])
    })
  })

  describe('start', () => {
    beforeEach(async () => {
      await deps.redis?.del(QUEUE_IDS_KEY)
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
      const redisWithoutPrefix = new Redis(getSanitizedTestRedisConfig())
      const [, score] = await redisWithoutPrefix.zrange(QUEUE_IDS_KEY, 0, -1, 'WITHSCORES')
      const queueIds = await FakeBackgroundJobProcessor.getActiveQueueIds(getTestRedisConfig())
      expect(queueIds).toStrictEqual(['queue1'])
      // Comparing timestamps in seconds
      const todaySeconds = Math.floor(today.getTime() / 1000)
      const scoreSeconds = Math.floor(new Date(Number.parseInt(score)).getTime() / 1000)
      // max difference 1 to handle edge case of 0.1 - 1.0
      expect(scoreSeconds - todaySeconds).lessThanOrEqual(1)

      // disposing and restarting to check that timestamp is updated
      await processor.dispose()
      await processor.start()

      const [, scoreAfterRestart] = await redisWithoutPrefix.zrange(
        QUEUE_IDS_KEY,
        0,
        -1,
        'WITHSCORES',
      )
      const queueIdsAfterRestart = await FakeBackgroundJobProcessor.getActiveQueueIds(
        getTestRedisConfig(),
      )
      expect(queueIdsAfterRestart).toStrictEqual(['queue1'])
      expect(new Date(Number.parseInt(score))).not.toEqual(
        new Date(Number.parseInt(scoreAfterRestart)),
      )

      await processor.dispose()
      redisWithoutPrefix.disconnect()
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
        },
        `Started job ${QueueName}`,
        [],
      ])
      expect(lastInfoSpy.mock.calls[1]).toMatchObject([
        {
          isSuccess: true,
        },
        `Finished job ${QueueName}`,
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
      expect(successBackgroundJobProcessor.jobDataResult).toStrictEqual({
        metadata: jobData.metadata,
      })
      expect(job.data).toStrictEqual(jobData)
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

      // Note that this relies on "background-jobs-common" and "node-core" using the same "pino" package instance, otherwise symbol won't match
      // For this reason there is an explicit pino dependency in root package.json, so that both node-core and pino are resolved from a global node_modules
      expect(
        processor.lastLogger?.[symbols.chindingsSym as unknown as keyof CommonLogger],
      ).toContain('"x-request-id"')
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

      const jobId = await processor.schedule(
        { id: 'test_id', value: 'test', metadata: { correlationId: 'correlation_id' } },
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
          error: expect.stringContaining(onFailedError.message),
        },
      })
    })
  })

  describe('stalled', () => {
    let processor: TestStalledBackgroundJobProcessor

    beforeEach(async () => {
      // @ts-ignore this is intentional
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
          jobId,
          errorJson: expect.stringContaining(onFailedCall.error.message),
        },
      })
      expect(
        processor.lastLogger?.[symbols.chindingsSym as unknown as keyof CommonLogger],
      ).toContain('"x-request-id"')
    })
  })

  describe('getJobsInStates', () => {
    const QueueName = 'AbstractBackgroundJobProcessor_getJobsInStates'
    let processor: FakeBackgroundJobProcessor<JobData>

    beforeEach(async () => {
      processor = new FakeBackgroundJobProcessor<JobData>(deps, QueueName)
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
})
