import { randomUUID } from 'node:crypto'
import type { ErrorReporter } from '@lokalise/node-core'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest'
import { z } from 'zod/v4'
import {
  buildFakeTransactionObservabilityManager,
  buildTestQueueManager,
  getPersistedJob,
  silentLogger,
  waitForJobState,
} from '../../test/testUtils.ts'
import { MutedUnrecoverableError } from '../errors/MutedUnrecoverableError.ts'
import { UnrecoverableError } from '../errors/UnrecoverableError.ts'
import type { PgBossQueueManager } from '../queues/PgBossQueueManager.ts'
import type { QueueConfiguration } from '../queues/types.ts'
import { deadLetterQueueNameBuilder } from '../queues/utils.ts'
import { BASE_JOB_PAYLOAD_SCHEMA, type RequestContext } from '../types.ts'
import { AbstractPgBossJobProcessor } from './AbstractPgBossJobProcessor.ts'
import type { PgBossJob, PgBossJobProcessorDependencies, PgBossWorkerOptions } from './types.ts'

const QUEUE_ID = 'job_processor_test'
const RETRYING_QUEUE_ID = 'job_processor_test_retrying'

const testSchema = BASE_JOB_PAYLOAD_SCHEMA.extend({ entityId: z.string() })
type TestPayload = z.infer<typeof testSchema>

const testQueues = [
  { queueId: QUEUE_ID, jobPayloadSchema: testSchema, queueOptions: { retryLimit: 0 } },
  { queueId: RETRYING_QUEUE_ID, jobPayloadSchema: testSchema, queueOptions: { retryLimit: 1 } },
] as const satisfies QueueConfiguration[]
type TestQueues = typeof testQueues
type TestQueueId = (typeof testQueues)[number]['queueId']

type ProcessFn = (job: PgBossJob<TestPayload>, requestContext: RequestContext) => Promise<unknown>

class TestJobProcessor extends AbstractPgBossJobProcessor<TestQueues, TestQueueId, unknown> {
  public readonly onSuccessCalls: string[] = []
  public readonly onFailedCalls: Array<{ jobId: string; error: Error }> = []
  public onSuccessImpl = (): Promise<void> => Promise.resolve()
  private readonly processImpl: ProcessFn

  constructor(
    dependencies: PgBossJobProcessorDependencies<TestQueues>,
    processImpl: ProcessFn = () => Promise.resolve(),
    queueId: TestQueueId = QUEUE_ID,
    workerOptions?: PgBossWorkerOptions,
  ) {
    super(dependencies, { queueId, ownerName: 'test-owner', workerOptions })
    this.processImpl = processImpl
  }

  protected process(job: PgBossJob<TestPayload>, requestContext: RequestContext) {
    return this.processImpl(job, requestContext)
  }

  protected override async onSuccess(job: PgBossJob<TestPayload>): Promise<void> {
    this.onSuccessCalls.push(job.id)
    await this.onSuccessImpl()
  }

  protected override onFailed(job: PgBossJob<TestPayload>, error: Error): Promise<void> {
    this.onFailedCalls.push({ jobId: job.id, error })
    return Promise.resolve()
  }
}

const payload = (correlationId = 'corr') => ({
  entityId: randomUUID(),
  metadata: { correlationId },
})

describe('AbstractPgBossJobProcessor', () => {
  let manager: PgBossQueueManager<TestQueues>
  let processor: TestJobProcessor | undefined
  let report: Mock<ErrorReporter['report']>
  let transactionObservabilityManager: ReturnType<typeof buildFakeTransactionObservabilityManager>
  let deps: PgBossJobProcessorDependencies<TestQueues>

  beforeAll(async () => {
    manager = buildTestQueueManager(testQueues)
    await manager.start()
    await manager.provisionQueues()
  })

  beforeEach(() => {
    report = vi.fn<ErrorReporter['report']>()
    transactionObservabilityManager = buildFakeTransactionObservabilityManager()
    deps = {
      queueManager: manager,
      logger: silentLogger,
      errorReporter: { report },
      transactionObservabilityManager,
    }
  })

  afterEach(async () => {
    await processor?.dispose()
    processor = undefined
  })

  afterAll(async () => {
    await manager.dispose()
  })

  describe('lifecycle', () => {
    it('refuses a second processor on the same queue while the first runs', async () => {
      processor = new TestJobProcessor(deps)
      await processor.start()
      const second = new TestJobProcessor(deps)

      await expect(second.start()).rejects.toThrow(
        `Processor for queue id "${QUEUE_ID}" is not unique.`,
      )
    })

    it('tolerates repeated and concurrent start and dispose calls, and restarts', async () => {
      processor = new TestJobProcessor(deps)
      await Promise.all([processor.start(), processor.start()])
      await processor.start()
      await processor.dispose()
      await processor.dispose()

      const jobId = await manager.schedule(QUEUE_ID, payload())
      await processor.start()

      await expect(processor.spy.waitForJobWithId(jobId, 'completed')).resolves.toBeDefined()
    })

    it('starts the manager lazily', async () => {
      const lazyManager = buildTestQueueManager(testQueues)
      processor = new TestJobProcessor({ ...deps, queueManager: lazyManager })

      await processor.start()

      expect(lazyManager.isStarted).toBe(true)
      await processor.dispose()
      await lazyManager.dispose()
    })

    it('throws on start when the manager is not started and lazy init is disabled', async () => {
      const stoppedManager = buildTestQueueManager(testQueues, { lazyInitEnabled: false })
      processor = new TestJobProcessor({ ...deps, queueManager: stoppedManager })

      await expect(processor.start()).rejects.toThrow('PgBossQueueManager is not started')
      // The failed start leaves no registration behind.
      const replacement = new TestJobProcessor(deps)
      await replacement.start()
      await replacement.dispose()
    })

    it('does not throw on dispose when the manager was stopped first', async () => {
      const ownManager = buildTestQueueManager(testQueues)
      processor = new TestJobProcessor({ ...deps, queueManager: ownManager })
      await processor.start()
      await ownManager.dispose()

      await expect(processor.dispose()).resolves.toBeUndefined()
    })
  })

  describe('processing', () => {
    it('completes the job, stores the returned value and runs onSuccess', async () => {
      const contexts: RequestContext[] = []
      processor = new TestJobProcessor(deps, (job, requestContext) => {
        contexts.push(requestContext)
        return Promise.resolve({ processed: job.data.entityId })
      })
      await processor.start()
      const jobPayload = payload('corr-success')

      const jobId = await manager.schedule(QUEUE_ID, jobPayload)
      await processor.spy.waitForJobWithId(jobId, 'completed')

      expect(contexts[0]?.reqId).toBe('corr-success')
      expect(processor.onSuccessCalls).toEqual([jobId])
      const job = await getPersistedJob(manager, QUEUE_ID, jobId)
      expect(job?.output).toEqual({ processed: jobPayload.entityId })
      expect(transactionObservabilityManager.start).toHaveBeenCalledWith(
        `bg_job:test-owner:${QUEUE_ID}`,
        jobId,
      )
      expect(transactionObservabilityManager.stop).toHaveBeenCalledWith(jobId, true)
      expect(report).not.toHaveBeenCalled()
    })

    it('processes every job of a batch on its own outcome', async () => {
      processor = new TestJobProcessor(
        deps,
        (job) =>
          job.data.metadata.correlationId === 'corr-bad'
            ? Promise.reject(new Error('bad job'))
            : Promise.resolve(),
        QUEUE_ID,
        { batchSize: 2 },
      )
      const [goodId, badId] = await manager.scheduleBulk(QUEUE_ID, [
        payload('corr-good'),
        payload('corr-bad'),
      ])
      await processor.start()

      await processor.spy.waitForJobWithId(goodId!, 'completed')
      await processor.spy.waitForJobWithId(badId!, 'failed')

      expect(transactionObservabilityManager.stop).toHaveBeenCalledWith(goodId, true)
      expect(transactionObservabilityManager.stop).toHaveBeenCalledWith(badId, false)
    })

    it('retries a failed job, and reports it only once it is out of retries', async () => {
      const process = vi.fn().mockRejectedValue(new Error('still broken'))
      processor = new TestJobProcessor(deps, process, RETRYING_QUEUE_ID)
      await processor.start()

      const jobId = await manager.schedule(RETRYING_QUEUE_ID, payload('corr-retry'))
      const job = await waitForJobState(manager, RETRYING_QUEUE_ID, jobId, 'failed')

      expect(process).toHaveBeenCalledTimes(2)
      expect(report).toHaveBeenCalledTimes(1)
      expect(report).toHaveBeenCalledWith({
        error: expect.objectContaining({ message: 'still broken' }),
        context: expect.objectContaining({
          jobId,
          jobName: RETRYING_QUEUE_ID,
          'x-request-id': 'corr-retry',
          errorJson: expect.stringContaining('still broken'),
        }),
      })
      expect(processor.onFailedCalls).toEqual([
        { jobId, error: expect.objectContaining({ message: 'still broken' }) },
      ])
      expect(job.output).toMatchObject({ message: 'still broken' })
    })

    it('succeeds on a retry without reporting the failed attempt', async () => {
      const process = vi.fn().mockRejectedValueOnce(new Error('flaky')).mockResolvedValue(undefined)
      processor = new TestJobProcessor(deps, process, RETRYING_QUEUE_ID)
      await processor.start()

      const jobId = await manager.schedule(RETRYING_QUEUE_ID, payload())
      await processor.spy.waitForJobWithId(jobId, 'completed')

      expect(process).toHaveBeenCalledTimes(2)
      expect(report).not.toHaveBeenCalled()
      expect(processor.onFailedCalls).toEqual([])
    })

    it('dead-letters a job failing with an UnrecoverableError without spending retries', async () => {
      processor = new TestJobProcessor(
        deps,
        () => Promise.reject(new UnrecoverableError('give up')),
        RETRYING_QUEUE_ID,
      )
      await processor.start()
      await manager.boss.deleteQueuedJobs(deadLetterQueueNameBuilder(RETRYING_QUEUE_ID))

      const jobId = await manager.schedule(RETRYING_QUEUE_ID, payload('corr-unrecoverable'))
      const job = await waitForJobState(manager, RETRYING_QUEUE_ID, jobId, 'failed')

      expect(job.retryCount).toBe(0)
      expect(report).toHaveBeenCalledTimes(1)
      expect(processor.onFailedCalls).toHaveLength(1)
      const [deadLettered] = await manager.boss.fetch<TestPayload>(
        deadLetterQueueNameBuilder(RETRYING_QUEUE_ID),
      )
      expect(deadLettered?.data.metadata.correlationId).toBe('corr-unrecoverable')
    })

    it('does not report a MutedUnrecoverableError', async () => {
      processor = new TestJobProcessor(deps, () =>
        Promise.reject(new MutedUnrecoverableError('expected')),
      )
      await processor.start()

      const jobId = await manager.schedule(QUEUE_ID, payload())
      await processor.spy.waitForJobWithId(jobId, 'failed')

      expect(report).not.toHaveBeenCalled()
      expect(processor.onFailedCalls).toHaveLength(1)
    })

    it('fails a job that throws a non-error value', async () => {
      processor = new TestJobProcessor(deps, () => Promise.reject('plain string' as any))
      await processor.start()

      const jobId = await manager.schedule(QUEUE_ID, payload())
      await processor.spy.waitForJobWithId(jobId, 'failed')

      expect(report).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ message: 'plain string' }) }),
      )
    })

    it('dead-letters an invalid payload without calling process', async () => {
      const process = vi.fn()
      processor = new TestJobProcessor(deps, process, RETRYING_QUEUE_ID)
      await processor.start()

      // Sent around the manager, so the payload skips validation: a dead letter redrive or a
      // producer on an older schema looks like this.
      const jobId = (await manager.boss.send(RETRYING_QUEUE_ID, {
        entityId: 'no-metadata',
      })) as string
      const job = await waitForJobState(manager, RETRYING_QUEUE_ID, jobId, 'failed')

      expect(process).not.toHaveBeenCalled()
      expect(job.retryCount).toBe(0)
      expect(job.output).toMatchObject({ reason: 'Job payload failed schema validation' })
      expect(report).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({ jobId, 'x-request-id': jobId }),
        }),
      )
    })

    it('keeps the job completed when onSuccess throws, and reports the hook error', async () => {
      processor = new TestJobProcessor(deps)
      processor.onSuccessImpl = () => Promise.reject(new Error('hook failed'))
      await processor.start()

      const jobId = await manager.schedule(QUEUE_ID, payload())
      await processor.spy.waitForJobWithId(jobId, 'completed')

      expect(report).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ message: 'hook failed' }) }),
      )
    })
  })
})
