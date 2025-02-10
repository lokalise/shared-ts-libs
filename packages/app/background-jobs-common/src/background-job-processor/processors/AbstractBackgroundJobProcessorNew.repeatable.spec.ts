import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { DependencyMocks } from '../../../test/dependencyMocks'
import type { FakeQueueManager } from '../managers/FakeQueueManager'
import type { QueueConfiguration } from '../managers/types'
import { FakeBackgroundJobProcessorNew } from './FakeBackgroundJobProcessorNew'
import type { BackgroundJobProcessorDependenciesNew } from './types'

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
  let mocks: DependencyMocks
  let deps: BackgroundJobProcessorDependenciesNew<SupportedQueues, 'queue'>
  let queueManager: FakeQueueManager<SupportedQueues>
  let processor: FakeBackgroundJobProcessorNew<SupportedQueues, 'queue'>

  beforeEach(async () => {
    mocks = new DependencyMocks()
    deps = mocks.createNew(supportedQueues)
    queueManager = deps.queueManager

    await mocks.clearRedis()

    const redisConfig = mocks.getRedisConfig()
    processor = new FakeBackgroundJobProcessorNew<SupportedQueues, 'queue'>(
      deps,
      'queue',
      redisConfig,
    )
    await processor.start()
  })

  afterEach(async () => {
    await mocks.dispose()
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
    expect(schedulers[0].every).toBe('10')

    await processor.dispose()
  })
})
