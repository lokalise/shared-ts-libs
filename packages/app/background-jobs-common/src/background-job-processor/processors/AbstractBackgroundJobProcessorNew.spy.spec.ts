import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DependencyMocks } from '../../../test/dependencyMocks'

import { z } from 'zod'
import { TestReturnValueBackgroundJobProcessorNew } from '../../../test/processors/TestReturnValueBackgroundJobProcessorNew'
import type { QueueManager } from '../managers/QueueManager'
import type { QueueConfiguration, SupportedJobPayloads } from '../managers/types'
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

describe('AbstractBackgroundJobProcessorNew -  Spy', () => {
  let mocks: DependencyMocks
  let deps: BackgroundJobProcessorDependenciesNew<
    SupportedQueues,
    'queue',
    SupportedJobPayloads<SupportedQueues>,
    any
  >
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

  it('throws error when spy accessed in non-test mode', async () => {
    const processor = new FakeBackgroundJobProcessorNew<SupportedQueues, 'queue'>(
      deps,
      'queue',
      mocks.getRedisConfig(),
      false,
    )

    expect(() => processor.spy).throws(
      'spy was not instantiated, it is only available on test mode. Please use `config.isTest` to enable it.',
    )

    await processor.dispose()
  })

  it('spy contain returnValue', async () => {
    // Given
    type JobReturn = { result: string }
    const returnValue: JobReturn = { result: 'done' }

    const processor = new TestReturnValueBackgroundJobProcessorNew<
      SupportedQueues,
      'queue',
      SupportedJobPayloads<SupportedQueues>,
      JobReturn
    >(deps, 'queue', mocks.getRedisConfig(), returnValue)
    await processor.start()

    // When
    const jobId = await queueManager.schedule('queue', {
      id: 'test_id',
      value: 'test',
      metadata: { correlationId: 'correlation_id' },
    })

    // Then
    const jobSpy = await processor.spy.waitForJobWithId(jobId, 'completed')
    expect(jobSpy.returnvalue).toMatchObject(returnValue)

    await processor.dispose()
  })
})
