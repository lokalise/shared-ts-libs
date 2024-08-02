import { generateMonotonicUuid } from '@lokalise/id-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DependencyMocks } from '../../../test/dependencyMocks'
import type { BaseJobPayload } from '../types'

import { FakeBackgroundJobProcessor } from './FakeBackgroundJobProcessor'
import type { BackgroundJobProcessorDependencies } from './types'

type JobData = {
  value: string
} & BaseJobPayload

// Adding test to deprecated methods
describe('FakeBackgroundJobProcessor', () => {
  const QueueName = 'AbstractBackgroundJobProcessor_success'
  let mocks: DependencyMocks
  let deps: BackgroundJobProcessorDependencies<JobData>
  let processor: FakeBackgroundJobProcessor<JobData>

  beforeEach(async () => {
    mocks = new DependencyMocks()
    deps = mocks.create()
    processor = new FakeBackgroundJobProcessor<JobData>(deps, QueueName, mocks.getRedisConfig())
    await processor.start()
  })

  afterEach(async () => {
    await processor.dispose()
    await mocks.dispose()
  })

  it('process calls and clean works', async () => {
    const data = {
      value: 'test',
      metadata: { correlationId: generateMonotonicUuid() },
    }
    await processor.schedule(data)

    await processor.spy?.waitForJob((data) => data.value === 'test', 'completed')
    expect(processor.processCalls).toHaveLength(1)
    expect(processor.processCalls[0]).toEqual(data)

    processor.clean()
    expect(processor.processCalls).toHaveLength(0)
  })
})
