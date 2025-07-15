import { setTimeout } from 'node:timers/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  type BarrierSupportedQueues,
  barrierSupportedQueues,
  TestQueueSizeJobBarrierBackgroundJobProcessorNew,
} from '../../../test/processors/barrier/TestQueueSizeJobBarrierBackgroundJobProcessorNew.js'
import { TestDependencyFactory } from '../../../test/TestDependencyFactory.ts'
import type { BackgroundJobProcessorDependenciesNew } from '../processors/types.ts'
import { createJobQueueSizeThrottlingBarrierNew } from './JobQueueSizeThrottlingBarrierNew.js'

describe('JobQueueSizeThrottlingBarrier', () => {
  let factory: TestDependencyFactory
  let deps: BackgroundJobProcessorDependenciesNew<BarrierSupportedQueues, any>

  beforeEach(async () => {
    factory = new TestDependencyFactory()
    deps = factory.createNew(barrierSupportedQueues)
    await deps.queueManager.start()
    await factory.clearRedis()
  })

  afterEach(async () => {
    await factory.dispose()
  })

  it('processes a job when barrier passes', async () => {
    const processor = new TestQueueSizeJobBarrierBackgroundJobProcessorNew(
      deps,
      factory.getRedisConfig(),
      createJobQueueSizeThrottlingBarrierNew<BarrierSupportedQueues>({
        queueId: 'forever_reschedule_queue',
        maxQueueJobsInclusive: 5,
        retryPeriodInMsecs: 2000,
      }),
    )
    await processor.start()

    const job1 = await deps.queueManager.schedule('queue', {
      id: 'test_id',
      metadata: { correlationId: 'correlation_id' },
    })
    const job2 = await deps.queueManager.schedule('queue', {
      id: 'test_id2',
      metadata: { correlationId: 'correlation_id' },
    })
    await processor.spy.waitForJobWithId(job1, 'completed')
    await processor.spy.waitForJobWithId(job2, 'completed')
    expect(await deps.queueManager.getJobCount('forever_reschedule_queue')).toBe(2)

    await processor.dispose()
  })

  it('delays when barrier does not pass', async () => {
    const processor = new TestQueueSizeJobBarrierBackgroundJobProcessorNew(
      deps,
      factory.getRedisConfig(),
      createJobQueueSizeThrottlingBarrierNew<BarrierSupportedQueues>({
        queueId: 'forever_reschedule_queue',
        maxQueueJobsInclusive: 2,
        retryPeriodInMsecs: 4000,
      }),
    )
    await processor.start()

    const job1 = await deps.queueManager.schedule('queue', {
      id: 'test_id',
      metadata: { correlationId: 'correlation_id' },
    })
    const job2 = await deps.queueManager.schedule('queue', {
      id: 'test_id2',
      metadata: { correlationId: 'correlation_id' },
    })
    const job3 = await deps.queueManager.schedule('queue', {
      id: 'test_id3',
      metadata: { correlationId: 'correlation_id' },
    })
    await processor.spy.waitForJobWithId(job1, 'completed')
    await processor.spy.waitForJobWithId(job2, 'completed')
    await processor.spy.waitForJobWithId(job3, 'scheduled')
    await setTimeout(20)
    expect(await deps.queueManager.getJobCount('forever_reschedule_queue')).toBe(2)

    await processor.dispose()
  })
})
