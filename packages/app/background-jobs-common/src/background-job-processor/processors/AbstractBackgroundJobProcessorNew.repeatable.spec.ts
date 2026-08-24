import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { TestDependencyFactory } from '../../../test/TestDependencyFactory.ts'
import type { FakeQueueManager } from '../managers/FakeQueueManager.ts'
import type { QueueConfiguration } from '../managers/types.ts'
import { FakeBackgroundJobProcessorNew } from './FakeBackgroundJobProcessorNew.ts'
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

describe('AbstractBackgroundJobProcessorNew - repeatable', () => {
  let factory: TestDependencyFactory
  let deps: BackgroundJobProcessorDependenciesNew<SupportedQueues, 'queue'>
  let queueManager: FakeQueueManager<SupportedQueues>
  let processor: FakeBackgroundJobProcessorNew<SupportedQueues, 'queue'>

  beforeEach(async () => {
    factory = new TestDependencyFactory()
    deps = factory.createNew(supportedQueues)
    queueManager = deps.queueManager

    await factory.clearRedis()

    processor = new FakeBackgroundJobProcessorNew<SupportedQueues, 'queue'>(deps, 'queue')
    await processor.start()
  })

  afterEach(async () => {
    await factory.dispose()
  })

  it('schedules repeatable job', async () => {
    // When
    await queueManager.start()
    const queue = queueManager.getQueue('queue')
    const scheduledJob = await queue.upsertJobScheduler(
      'test_scheduler',
      { every: 10, immediately: true, limit: 5 },
      {
        data: {
          id: 'test_id',
          value: 'test',
          metadata: { correlationId: 'correlation_id' },
        },
      },
    )

    // Then
    await processor.spy.waitForJobWithId(scheduledJob.id, 'completed')

    const schedulers = await queue.getJobSchedulers()
    expect(schedulers).toHaveLength(1)
    expect(schedulers[0]!.every).toBe(10)

    await processor.dispose()
  })
})
