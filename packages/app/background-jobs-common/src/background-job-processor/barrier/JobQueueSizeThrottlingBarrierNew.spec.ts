import { setTimeout } from 'node:timers/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TestDependencyFactory } from '../../../test/TestDependencyFactory.ts'
import type {BackgroundJobProcessorDependenciesNew} from '../processors/types.ts'
import type { BaseJobPayload } from '../types.ts'
import { createJobQueueSizeThrottlingBarrier } from './JobQueueSizeThrottlingBarrier.ts'
import type {QueueConfiguration} from "../managers/index.js";
import {z} from 'zod'
import {
  TestQueueSizeJobBarrierBackgroundJobProcessorNew
} from "../../../test/processors/TestQueueSizeJobBarrierBackgroundJobProcessorNew.js";

type JobData = {
  id: string
  value: string
} & BaseJobPayload

const supportedQueues = [
  {
    queueId: 'queue1',
    jobPayloadSchema: z
        .object({
          id: z.string(),
          value: z.string(),
          metadata: z.object({
            correlationId: z.string(),
          }),
        })
        .strict(),
  },
] as const satisfies QueueConfiguration[]

type SupportedQueues = typeof supportedQueues

describe('JobQueueSizeThrottlingBarrier', () => {
  let factory: TestDependencyFactory
  let deps: BackgroundJobProcessorDependenciesNew<JobData, any>

  beforeEach(async () => {
    factory = new TestDependencyFactory()
    deps = factory.createNew(supportedQueues)
    await factory.clearRedis()
  })

  afterEach(async () => {
    await factory.dispose()
  })

  it('processes a job when barrier passes', async () => {
    type JobReturn = { result: string }

    const processor = new TestQueueSizeJobBarrierBackgroundJobProcessorNew<JobData, JobReturn>(
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

    const processor = new TestQueueSizeJobBarrierBackgroundJobProcessorNew<JobData, JobReturn>(
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
