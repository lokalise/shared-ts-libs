import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { TestDependencyFactory } from '../../../test/TestDependencyFactory.js'
import type { FakeQueueManager } from '../managers/FakeQueueManager.js'
import type { QueueConfiguration } from '../managers/types.js'
import { FakeBackgroundJobProcessorNew } from './FakeBackgroundJobProcessorNew.js'
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
    const scheduledJobId = await queueManager.schedule(
      'queue',
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

    const schedulers = await queueManager.getQueue('queue').getJobSchedulers()
    expect(schedulers).toHaveLength(1)
    expect(schedulers[0]!.every).toBe('10')

    await processor.dispose()
  })
})
