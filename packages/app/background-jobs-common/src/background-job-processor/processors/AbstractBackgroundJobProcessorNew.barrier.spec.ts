import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { z } from 'zod'
import { DependencyMocks } from '../../../test/dependencyMocks'
import { TestBarrierBackgroundJobProcessorNew } from '../../../test/processors/TestBarrierBackgroundJobProcessorNew'
import type { QueueManager } from '../managers/QueueManager'
import type { QueueConfiguration } from '../managers/types'
import type { BackgroundJobProcessorDependenciesNew } from './types'

const supportedQueues = [
  {
    queueId: 'queue',
    jobPayloadSchema: z.object({
      id: z.string(),
      metadata: z.object({
        correlationId: z.string(),
      }),
    }),
  },
] as const satisfies QueueConfiguration[]

type SupportedQueues = typeof supportedQueues

describe('AbstractBackgroundJobProcessor Barrier', () => {
  let mocks: DependencyMocks
  let deps: BackgroundJobProcessorDependenciesNew<SupportedQueues, 'queue', any>
  let queueManager: QueueManager<SupportedQueues>

  beforeEach(async () => {
    mocks = new DependencyMocks()
    deps = mocks.createNew(supportedQueues)
    queueManager = deps.queueManager

    await mocks.clearRedis()
  })

  afterEach(async () => {
    await mocks.dispose()
  })

  it('executes as usual when barrier passes', async () => {
    type JobReturn = { result: string }

    let counter = 0
    const processor = new TestBarrierBackgroundJobProcessorNew<SupportedQueues, 'queue', JobReturn>(
      deps,
      'queue',
      mocks.getRedisConfig(),
      () => {
        counter++
        return Promise.resolve({
          isPassing: true,
        })
      },
    )
    await processor.start()

    const jobId = await queueManager.schedule('queue', {
      id: 'test_id',
      metadata: { correlationId: 'correlation_id' },
    })
    const jobSpy = await processor.spy.waitForJobWithId(jobId, 'completed')

    expect(jobSpy.attemptsMade).toBe(1)
    expect(counter).toBe(1)
    await processor.dispose()
  })

  it('delays when barrier does not pass', async () => {
    type JobReturn = { result: string }

    let counter = 0
    const processor = new TestBarrierBackgroundJobProcessorNew<SupportedQueues, 'queue', JobReturn>(
      deps,
      'queue',
      mocks.getRedisConfig(),
      () => {
        counter++

        if (counter > 2) {
          return Promise.resolve({
            isPassing: true,
          })
        }

        return Promise.resolve({
          isPassing: false,
          delayAmountInMs: 1,
        })
      },
    )
    await processor.start()

    const jobId = await queueManager.schedule('queue', {
      id: 'test_id',
      metadata: { correlationId: 'correlation_id' },
    })
    const jobSpy = await processor.spy.waitForJobWithId(jobId, 'completed')

    expect(jobSpy.attemptsMade).toBe(1)
    expect(counter).toBe(3)
    await processor.dispose()
  })
})
