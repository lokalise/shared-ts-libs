import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DependencyMocks } from '../../../test/dependencyMocks'
import { TestBarrierBackgroundJobProcessor } from '../../../test/processors/TestBarrierBackgroundJobProcessor'
import type { BaseJobPayload } from '../types'
import type { BackgroundJobProcessorDependencies } from './types'

type JobData = {
  id: string
  value: string
} & BaseJobPayload

describe('AbstractBackgroundJobProcessor Barrier', () => {
  let mocks: DependencyMocks
  let deps: BackgroundJobProcessorDependencies<JobData, any>

  beforeEach(() => {
    mocks = new DependencyMocks()
    deps = mocks.create()
  })

  afterEach(async () => {
    await mocks.dispose()
  })

  describe('barrier', () => {
    it('executes as usual when barrier passes', async () => {
      type JobReturn = { result: string }

      let counter = 0
      const processor = new TestBarrierBackgroundJobProcessor<JobData, JobReturn>(
        deps,
        mocks.getRedisConfig(),
        () => {
          counter++
          return Promise.resolve({
            isPassing: true,
          })
        },
      )
      await processor.start()

      const jobId = await processor.schedule({
        id: 'test_id',
        value: 'test',
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
      const processor = new TestBarrierBackgroundJobProcessor<JobData, JobReturn>(
        deps,
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

      const jobId = await processor.schedule({
        id: 'test_id',
        value: 'test',
        metadata: { correlationId: 'correlation_id' },
      })
      const jobSpy = await processor.spy.waitForJobWithId(jobId, 'completed')

      expect(jobSpy.attemptsMade).toBe(1)
      expect(counter).toBe(3)
      await processor.dispose()
    })
  })
})