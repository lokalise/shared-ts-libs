import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TestReturnValueBackgroundJobProcessor } from '../../../test/processors/TestReturnValueBackgroundJobProcessor.ts'
import { TestDependencyFactory } from '../../../test/TestDependencyFactory.ts'
import type { BaseJobPayload } from '../types.ts'
import { FakeBackgroundJobProcessor } from './FakeBackgroundJobProcessor.ts'
import type { BackgroundJobProcessorDependencies } from './types.ts'

type JobData = {
  id: string
  value: string
} & BaseJobPayload

describe('AbstractBackgroundJobProcessor Spy', () => {
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

  describe('spy', () => {
    it('throws error when spy accessed in non-test mode', async () => {
      const processor = new FakeBackgroundJobProcessor<JobData>(
        deps,
        'myQueue1',
        factory.getRedisConfig(),
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

      const processor = new TestReturnValueBackgroundJobProcessor<JobData, JobReturn>(
        deps,
        factory.getRedisConfig(),
        returnValue,
      )
      await processor.start()

      // When
      const jobId = await processor.schedule({
        id: 'test_id',
        value: 'test',
        metadata: { correlationId: 'correlation_id' },
      })

      // Then
      const jobSpy = await processor.spy.waitForJobWithId(jobId, 'completed')
      expect(jobSpy.returnvalue).toMatchObject(returnValue)

      await processor.dispose()
    })

    it('can await job to be scheduled', async () => {
      // Given
      const processor = new FakeBackgroundJobProcessor<JobData>(
        deps,
        'queue1',
        factory.getRedisConfig(),
      )

      // When
      await processor.start()
      const jobId = await processor.schedule({
        id: '123',
        value: 'val1',
        metadata: {
          correlationId: '111',
        },
      })

      // Then
      const [result1, result2] = await Promise.all([
        processor.spy.waitForJob((job) => job.value === 'val1', 'scheduled'),
        processor.spy.waitForJobWithId(jobId, 'scheduled'),
      ])
      expect(result1).toEqual(result2)
      expect(result1.data).toMatchInlineSnapshot(`
				{
				  "id": "123",
				  "metadata": {
				    "correlationId": "111",
				  },
				  "value": "val1",
				}
			`)

      await processor.dispose()
    })
  })
})
