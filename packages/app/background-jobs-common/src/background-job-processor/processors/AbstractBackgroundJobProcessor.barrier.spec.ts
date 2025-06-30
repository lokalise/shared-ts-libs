import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TestBarrierBackgroundJobProcessor } from '../../../test/processors/TestBarrierBackgroundJobProcessor.ts'
import { TestDependencyFactory } from '../../../test/TestDependencyFactory.ts'
import type { BaseJobPayload } from '../types.ts'
import type { BackgroundJobProcessorDependencies } from './types.ts'

type JobData = {
  id: string
  value: string
} & BaseJobPayload

describe('AbstractBackgroundJobProcessor Barrier', () => {
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

  describe('barrier', () => {
    it('executes as usual when barrier passes', async () => {
      type JobReturn = { result: string }

      let counter = 0
      const processor = new TestBarrierBackgroundJobProcessor<JobData, JobReturn>(
        deps,
        factory.getRedisConfig(),
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
        factory.getRedisConfig(),
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
