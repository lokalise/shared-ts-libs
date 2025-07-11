import { UnrecoverableError } from 'bullmq'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'
import { TestFailingBackgroundJobProcessorNew } from '../../../test/processors/TestFailingBackgroundJobProcessorNew.ts'
import { TestDependencyFactory } from '../../../test/TestDependencyFactory.ts'
import { MutedUnrecoverableError } from '../errors/MutedUnrecoverableError.ts'
import type { FakeQueueManager } from '../managers/FakeQueueManager.ts'
import type { QueueConfiguration } from '../managers/types.ts'
import type { BackgroundJobProcessorDependenciesNew } from './types.ts'

const supportedQueues = [
  {
    queueId: 'queue',
    jobPayloadSchema: z.object({
      id: z.string(),
      value: z.string(),
      metadata: z.object({
        correlationId: z.string(),
      }),
    }),
  },
] as const satisfies QueueConfiguration[]

type SupportedQueues = typeof supportedQueues

describe('AbstractBackgroundJobProcessorNew - error', () => {
  let factory: TestDependencyFactory
  let deps: BackgroundJobProcessorDependenciesNew<SupportedQueues, 'queue'>
  let queueManager: FakeQueueManager<typeof supportedQueues>
  let processor: TestFailingBackgroundJobProcessorNew<SupportedQueues, 'queue'>

  beforeEach(async () => {
    factory = new TestDependencyFactory()
    deps = factory.createNew(supportedQueues)
    queueManager = deps.queueManager

    await factory.clearRedis()

    processor = new TestFailingBackgroundJobProcessorNew<SupportedQueues, 'queue'>(deps, 'queue')
    await processor.start()
  })

  afterEach(async () => {
    await processor.dispose()
    await factory.dispose()
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
      'queue',
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
    const jobId = await queueManager.schedule(
      'queue',
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
    const jobId = await queueManager.schedule(
      'queue',
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
    const jobId = await queueManager.schedule(
      'queue',
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
        jobName: 'queue',
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
    const jobId = await queueManager.schedule(
      'queue',
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

  it('job throws validation unrecoverable error', async () => {
    // Given
    const errorReporterSpy = vi.spyOn(deps.errorReporter, 'report')

    // When
    // Starting queue manually as we are bypassing the queue manager's job scheduling
    await queueManager.start(['queue'])
    // We need to add job directly to bypass queue manager's validation
    const job = await queueManager.getQueue('queue').add('queue', {
      id: 'test_id',
      value: 1 as any, // Invalid type
      metadata: { correlationId: 'correlation_id' },
    })

    // Then
    const jobSpy = await processor.spy.waitForJobWithId(job!.id, 'failed')

    expect(processor.errorsOnProcess).length(1)
    expect(jobSpy.attemptsMade).toBe(1)
    expect(jobSpy.failedReason).toMatchInlineSnapshot(`
      "[
        {
          "expected": "string",
          "code": "invalid_type",
          "path": [
            "value"
          ],
          "message": "Invalid input: expected string, received number"
        }
      ]"
    `)
    expect(errorReporterSpy).toHaveBeenCalledTimes(1)
    expect(errorReporterSpy.mock.calls[0]?.[0].error.message).toMatchInlineSnapshot(`
      "[
        {
          "expected": "string",
          "code": "invalid_type",
          "path": [
            "value"
          ],
          "message": "Invalid input: expected string, received number"
        }
      ]"
    `)
  })
})
