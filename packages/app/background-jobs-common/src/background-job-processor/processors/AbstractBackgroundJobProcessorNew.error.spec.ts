import { UnrecoverableError } from 'bullmq'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { TestDependencyFactory } from '../../../test/TestDependencyFactory.js'
import { TestFailingBackgroundJobProcessorNew } from '../../../test/processors/TestFailingBackgroundJobProcessorNew.js'
import type { FakeQueueManager } from '../managers/FakeQueueManager.js'
import type { QueueConfiguration } from '../managers/types.js'
import type { BackgroundJobProcessorDependenciesNew } from './types.js'

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
    expect(processor.errorsOnProcess[0]).toMatchObject(errors[2])
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
})
