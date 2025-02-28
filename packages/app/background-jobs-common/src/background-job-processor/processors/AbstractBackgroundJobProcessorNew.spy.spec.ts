import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest'

import { TestDependencyFactory } from '../../../test/TestDependencyFactory'

import { z } from 'zod'
import { TestReturnValueBackgroundJobProcessorNew } from '../../../test/processors/TestReturnValueBackgroundJobProcessorNew'
import { FakeQueueManager } from '../managers/FakeQueueManager'
import type { QueueManager } from '../managers/QueueManager'
import type { QueueConfiguration } from '../managers/types'
import type { BackgroundJobProcessorSpyInterface } from '../spy/types'
import { FakeBackgroundJobProcessorNew } from './FakeBackgroundJobProcessorNew'
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

describe('AbstractBackgroundJobProcessorNew -  Spy', () => {
  let factory: TestDependencyFactory
  let deps: BackgroundJobProcessorDependenciesNew<SupportedQueues, 'queue', any>
  let queueManager: QueueManager<SupportedQueues>

  beforeEach(async () => {
    factory = new TestDependencyFactory()
    deps = factory.createNew(supportedQueues)
    queueManager = deps.queueManager
    await factory.clearRedis()
  })

  afterEach(async () => {
    await factory.dispose()
  })

  it('throws error when spy accessed in non-test mode', async () => {
    const nonTesQueueManager = new FakeQueueManager(supportedQueues, {
      isTest: false,
      redisConfig: factory.getRedisConfig(),
    })
    await nonTesQueueManager.start()
    const processor = new FakeBackgroundJobProcessorNew<SupportedQueues, 'queue'>(
      { ...deps, queueManager: nonTesQueueManager },
      'queue',
    )

    expect(() => nonTesQueueManager.getSpy('queue')).toThrowErrorMatchingInlineSnapshot(
      '[Error: queue spy was not instantiated, it is only available on test mode. Please use `config.isTest` to enable it on QueueManager]',
    )
    expect(() => processor.spy).toThrowErrorMatchingInlineSnapshot(
      '[Error: queue spy was not instantiated, it is only available on test mode. Please use `config.isTest` to enable it on QueueManager]',
    )

    await processor.dispose()
    await nonTesQueueManager.dispose()
  })

  it('should share spy instance with queue manager', async () => {
    // Given
    const processor = new FakeBackgroundJobProcessorNew<SupportedQueues, 'queue'>(deps, 'queue')
    await processor.start()

    // When
    const jobId = await queueManager.schedule('queue', {
      id: 'test_id',
      metadata: { correlationId: 'correlation_id' },
    })
    const managerScheduleSpy = await queueManager
      .getSpy('queue')
      .waitForJobWithId(jobId, 'scheduled')
    const processorScheduleSpy = await processor.spy.waitForJobWithId(jobId, 'scheduled')
    expect(managerScheduleSpy).toEqual(processorScheduleSpy)

    // Then
    const completedSpyFromProcessor = await processor.spy.waitForJobWithId(jobId, 'completed')
    const completedSpyFromManager = await queueManager
      .getSpy('queue')
      .waitForJobWithId(jobId, 'completed')
    expect(completedSpyFromProcessor).toEqual(completedSpyFromManager)

    await processor.dispose()
  })

  it('spy contain returnValue', async () => {
    // Given
    type JobReturn = { result: string }
    const returnValue: JobReturn = { result: 'done' }

    const processor = new TestReturnValueBackgroundJobProcessorNew<
      SupportedQueues,
      'queue',
      JobReturn
    >(deps, 'queue', returnValue)
    await processor.start()

    // When
    const jobId = await queueManager.schedule('queue', {
      id: 'test_id',
      metadata: { correlationId: 'correlation_id' },
    })

    // Then
    const jobSpy = await processor.spy.waitForJobWithId(jobId, 'completed')
    expect(jobSpy.returnvalue).toMatchObject(returnValue)

    await processor.dispose()
  })

  it('should infer payload and return type from processor', () => {
    // Given
    const jobPayloadSchema = supportedQueues[0].jobPayloadSchema
    type JobPayload = z.infer<typeof jobPayloadSchema>

    const processor = new FakeBackgroundJobProcessorNew<SupportedQueues, 'queue'>(deps, 'queue')

    type spyType = typeof processor.spy
    expectTypeOf<spyType>().toMatchTypeOf<BackgroundJobProcessorSpyInterface<JobPayload, void>>()

    type JobReturn = { result: string }
    const processorWithReturnValue = new TestReturnValueBackgroundJobProcessorNew<
      SupportedQueues,
      'queue',
      JobReturn
    >(deps, 'queue', { result: 'done' })

    type spyTypeWithReturnValue = typeof processorWithReturnValue.spy
    expectTypeOf<spyTypeWithReturnValue>().toMatchTypeOf<
      BackgroundJobProcessorSpyInterface<JobPayload, JobReturn>
    >()
  })
})
