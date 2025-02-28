import { generateMonotonicUuid } from '@lokalise/id-utils'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { TestDependencyFactory } from '../../../test/TestDependencyFactory'
import { isPromiseFinished } from '../../../test/isPromiseFinished'
import { TestOverrideProcessBackgroundProcessor } from '../../../test/processors/TestOverrideProcessBackgroundProcessor'
import type { FakeQueueManager } from '../managers/FakeQueueManager'
import type { QueueConfiguration } from '../managers/types'
import { FakeBackgroundJobProcessorNew } from './FakeBackgroundJobProcessorNew'
import type { BackgroundJobProcessorDependenciesNew } from './types'

const supportedQueues = [
  {
    queueId: 'queue',
    jobPayloadSchema: z.object({
      id: z.string(),
      metadata: z.object({ correlationId: z.string() }),
    }),
  },
] as const satisfies QueueConfiguration[]

type SupportedQueues = typeof supportedQueues

describe('AbstractBackgroundJobProcessorNew - start', () => {
  let factory: TestDependencyFactory
  let deps: BackgroundJobProcessorDependenciesNew<SupportedQueues, 'queue'>
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
    const job1 = new FakeBackgroundJobProcessorNew<SupportedQueues, 'queue'>(deps, 'queue')

    await job1.start()
    await expect(
      new FakeBackgroundJobProcessorNew<SupportedQueues, 'queue'>(deps, 'queue').start(),
    ).rejects.toMatchInlineSnapshot('[Error: Processor for queue id "queue" is not unique.]')

    await job1.dispose()
  })

  it('Multiple start calls (sequential or concurrent) not produce errors', async () => {
    const processor = new FakeBackgroundJobProcessorNew<SupportedQueues, 'queue'>(deps, 'queue')

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
    const processor = new FakeBackgroundJobProcessorNew<SupportedQueues, 'queue'>(deps, 'queue')
    await processor.start()
    await processor.dispose()

    const jobId = await queueManager.schedule('queue', {
      id: generateMonotonicUuid(),
      metadata: { correlationId: generateMonotonicUuid() },
    })
    const completedPromise = processor.spy.waitForJobWithId(jobId, 'completed')
    await expect(isPromiseFinished(completedPromise)).resolves.toBe(false)

    await processor.start()
    await expect(isPromiseFinished(completedPromise)).resolves.toBe(true)

    await processor.dispose()
  })

  it('should infer job payload type', async () => {
    const jobDataSchema = supportedQueues[0].jobPayloadSchema
    type JobPayload = z.infer<typeof jobDataSchema>

    const processor = new TestOverrideProcessBackgroundProcessor<SupportedQueues, 'queue'>(
      deps,
      'queue',
    )
    await processor.start()

    processor.processOverride = (job) => {
      expectTypeOf(job.data).toEqualTypeOf<JobPayload>()
    }

    const jobId = await queueManager.schedule('queue', {
      id: generateMonotonicUuid(),
      metadata: { correlationId: generateMonotonicUuid() },
    })
    await processor.spy.waitForJobWithId(jobId, 'completed')

    await processor.dispose()
  })
})
