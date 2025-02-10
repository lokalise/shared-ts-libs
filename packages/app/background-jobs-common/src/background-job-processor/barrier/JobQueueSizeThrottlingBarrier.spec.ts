import { setTimeout } from 'node:timers/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TestDependencyFactory } from '../../../test/TestDependencyFactory'
import { TestQueueSizeJobBarrierBackgroundJobProcessor } from '../../../test/processors/TestQueueSizeJobBarrierBackgroundJobProcessor'
import type { BackgroundJobProcessorDependencies } from '../processors/types'
import type { BaseJobPayload } from '../types'
import { createJobQueueSizeThrottlingBarrier } from './JobQueueSizeThrottlingBarrier'

type JobData = {
  id: string
  value: string
} & BaseJobPayload

describe('JobQueueSizeThrottlingBarrier', () => {
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

  it('processes a job when barrier passes', async () => {
    type JobReturn = { result: string }

    const processor = new TestQueueSizeJobBarrierBackgroundJobProcessor<JobData, JobReturn>(
      deps,
      factory.getRedisConfig(),
      createJobQueueSizeThrottlingBarrier({
        maxQueueJobsInclusive: 5,
        retryPeriodInMsecs: 2000,
      }),
    )
    await processor.start()

    const job1 = await processor.schedule({
      id: 'test_id',
      value: 'test',
      metadata: { correlationId: 'correlation_id' },
    })
    const job2 = await processor.schedule({
      id: 'test_id2',
      value: 'test2',
      metadata: { correlationId: 'correlation_id' },
    })
    await processor.spy.waitForJobWithId(job1, 'completed')
    await processor.spy.waitForJobWithId(job2, 'completed')
    expect(await processor.throttledQueueJobProcessor.getJobCount()).toBe(2)

    await processor.dispose()
  })

  it('delays when barrier does not pass', async () => {
    type JobReturn = { result: string }

    const processor = new TestQueueSizeJobBarrierBackgroundJobProcessor<JobData, JobReturn>(
      deps,
      factory.getRedisConfig(),
      createJobQueueSizeThrottlingBarrier({
        maxQueueJobsInclusive: 2,
        retryPeriodInMsecs: 4000,
      }),
    )
    await processor.start()

    const job1 = await processor.schedule({
      id: 'test_id',
      value: 'test',
      metadata: { correlationId: 'correlation_id' },
    })
    const job2 = await processor.schedule({
      id: 'test_id2',
      value: 'test2',
      metadata: { correlationId: 'correlation_id' },
    })
    const job3 = await processor.schedule({
      id: 'test_id3',
      value: 'test3',
      metadata: { correlationId: 'correlation_id' },
    })
    await processor.spy.waitForJobWithId(job1, 'completed')
    await processor.spy.waitForJobWithId(job2, 'completed')
    await processor.spy.waitForJobWithId(job3, 'scheduled')
    await setTimeout(20)
    expect(await processor.throttledQueueJobProcessor.getJobCount()).toBe(2)

    await processor.dispose()
  })
})
