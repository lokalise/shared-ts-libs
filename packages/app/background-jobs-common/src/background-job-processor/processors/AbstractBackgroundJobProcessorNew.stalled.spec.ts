import { generateMonotonicUuid } from '@lokalise/id-utils'
import { waitAndRetry } from '@lokalise/node-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'
import { TestDependencyFactory } from '../../../test/TestDependencyFactory.ts'
import { TestStalledBackgroundJobProcessorNew } from '../../../test/processors/TestStalledBackgroundJobProcessorNew.ts'
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

describe('AbstractBackgroundJobProcessorNew - stalled', () => {
  let factory: TestDependencyFactory
  let deps: BackgroundJobProcessorDependenciesNew<SupportedQueues, 'queue'>
  let queueManager: FakeQueueManager<SupportedQueues>
  let stalledProcessor: TestStalledBackgroundJobProcessorNew<SupportedQueues, 'queue'>

  beforeEach(async () => {
    factory = new TestDependencyFactory()
    deps = factory.createNew(supportedQueues, true)

    await factory.clearRedis()

    queueManager = deps.queueManager

    stalledProcessor = new TestStalledBackgroundJobProcessorNew(deps, 'queue')
    await stalledProcessor.start()
    await queueManager.start()
  })

  afterEach(async () => {
    await stalledProcessor.dispose()
    await factory.dispose()
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
    const jobId = await queueManager.schedule('queue', jobData, {
      attempts: 1,
      backoff: { type: 'fixed', delay: 1 },
      removeOnComplete: true,
      removeOnFail: 1, // we should keep the job in the queue to test the stalled job behavior
    })

    // Then
    await waitAndRetry(() => stalledProcessor.onFailedErrors.length > 0, 100, 20)
    expect(stalledProcessor?.onFailedErrors).length(1)

    const onFailedCall = stalledProcessor?.onFailedErrors[0]
    expect(onFailedCall!.error.message).toBe('job stalled more than allowable limit')
    expect(onFailedCall!.job.id).toBe(jobId)
    expect(onFailedCall!.job.data).toMatchObject(jobData)
    expect(onFailedCall!.job.attemptsMade).toBe(1)

    expect(errorReporterSpy).toHaveBeenCalledWith({
      error: onFailedCall!.error,
      context: {
        jobId,
        jobName: 'queue',
        'x-request-id': jobData.metadata.correlationId,
        errorJson: expect.stringContaining(onFailedCall!.error.message),
      },
    })
  })
})
