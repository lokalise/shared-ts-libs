import { generateMonotonicUuid } from '@lokalise/id-utils'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import { isPromiseFinished } from '../../../test/isPromiseFinished.ts'
import { TestOverrideProcessBackgroundProcessor } from '../../../test/processors/TestOverrideProcessBackgroundProcessor.ts'
import { TestDependencyFactory } from '../../../test/TestDependencyFactory.ts'
import type { FakeQueueManager } from '../managers/FakeQueueManager.ts'
import type { QueueConfiguration } from '../managers/types.ts'
import { FakeBackgroundJobProcessorNew } from './FakeBackgroundJobProcessorNew.ts'
import type { BackgroundJobProcessorDependenciesNew } from './types.ts'

const supportedQueues = [
  {
    queueId: 'queue1',
    jobPayloadSchema: z.object({
      id: z.string(),
      metadata: z.object({ correlationId: z.string() }),
    }),
  },
  {
    queueId: 'queue2',
    bullDashboardGrouping: ['group'],
    jobPayloadSchema: z.object({
      metadata: z.object({ correlationId: z.string() }),
    }),
  },
] as const satisfies QueueConfiguration[]

type SupportedQueues = typeof supportedQueues

describe('AbstractBackgroundJobProcessorNew - start', () => {
  let factory: TestDependencyFactory
  let deps: BackgroundJobProcessorDependenciesNew<SupportedQueues, 'queue1' | 'queue2'>
  let queueManager: FakeQueueManager<SupportedQueues>

  beforeEach(async () => {
    factory = new TestDependencyFactory()
    deps = factory.createNew(supportedQueues)
    queueManager = deps.queueManager

    await factory.clearRedis()
  })

  afterEach(async () => {
    await factory.dispose()
  })

  it('throws an error if queue id is not unique', async () => {
    const job1 = new FakeBackgroundJobProcessorNew<SupportedQueues, 'queue1'>(deps, 'queue1')

    await job1.start()
    await expect(
      new FakeBackgroundJobProcessorNew<SupportedQueues, 'queue1'>(deps, 'queue1').start(),
    ).rejects.toMatchInlineSnapshot('[Error: Processor for queue id "queue1" is not unique.]')

    await job1.dispose()
  })

  it('Multiple start calls (sequential or concurrent) not produce errors', async () => {
    const processor = new FakeBackgroundJobProcessorNew<SupportedQueues, 'queue1'>(deps, 'queue1')

    // sequential start calls
    await expect(processor.start()).resolves.not.toThrowError()
    await expect(processor.start()).resolves.not.toThrowError()
    await processor.dispose()

    // concurrent start calls
    await expect(Promise.all([processor.start(), processor.start()])).resolves.not.toThrowError()
    await processor.dispose()
  })

  it('restart processor after dispose', async () => {
    await queueManager.start()
    const processor = new FakeBackgroundJobProcessorNew<SupportedQueues, 'queue1'>(deps, 'queue1')
    await processor.start()
    await processor.dispose()

    const jobId = await queueManager.schedule('queue1', {
      id: generateMonotonicUuid(),
      metadata: { correlationId: generateMonotonicUuid() },
    })
    const completedPromise = processor.spy.waitForJobWithId(jobId, 'completed')
    await expect(isPromiseFinished(completedPromise)).resolves.toBe(false)

    await processor.start()
    await expect(isPromiseFinished(completedPromise)).resolves.toBe(true)

    await processor.dispose()
  })

  it('should resolve queue id properly', async () => {
    const processor1 = new FakeBackgroundJobProcessorNew<SupportedQueues, 'queue1'>(deps, 'queue1')
    const processor2 = new FakeBackgroundJobProcessorNew<SupportedQueues, 'queue2'>(deps, 'queue2')
    await processor1.start()
    await processor2.start()

    // @ts-expect-error accessing protected property for testing
    expect(processor1.worker.name).toEqual('queue1')
    // @ts-expect-error accessing protected property for testing
    expect(processor2.worker.name).toEqual('group.queue2')

    await processor1.dispose()
    await processor2.dispose()
  })

  it('should infer job payload type', async () => {
    const jobDataSchema = supportedQueues[0].jobPayloadSchema
    type JobPayload = z.infer<typeof jobDataSchema>

    const processor = new TestOverrideProcessBackgroundProcessor<SupportedQueues, 'queue1'>(
      deps,
      'queue1',
    )
    await processor.start()

    processor.processOverride = (job) => {
      expectTypeOf(job.data).toEqualTypeOf<JobPayload>()
    }

    const jobId = await queueManager.schedule('queue1', {
      id: generateMonotonicUuid(),
      metadata: { correlationId: generateMonotonicUuid() },
    })
    await processor.spy.waitForJobWithId(jobId, 'completed')

    await processor.dispose()
  })
})
