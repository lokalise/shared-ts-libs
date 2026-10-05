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
  silentLogger,
  waitForJobState,
} from '../../test/testUtils.ts'
import { UnrecoverableError } from '../errors/UnrecoverableError.ts'
import type { PgBossQueueManager } from '../queues/PgBossQueueManager.ts'
import type { QueueConfiguration } from '../queues/types.ts'
import { deadLetterQueueNameBuilder } from '../queues/utils.ts'
import { BASE_JOB_PAYLOAD_SCHEMA, type RequestContext } from '../types.ts'
import {
  AbstractPgBossBatchJobProcessor,
  allJobsSucceeded,
  type BatchOutcome,
  someJobsFailed,
} from './AbstractPgBossBatchJobProcessor.ts'
import type { PgBossJob, PgBossJobProcessorDependencies } from './types.ts'

const QUEUE_ID = 'batch_processor_test'
const DLQ_ID = deadLetterQueueNameBuilder(QUEUE_ID)

const testSchema = BASE_JOB_PAYLOAD_SCHEMA.extend({ entityId: z.string() })
type TestPayload = z.infer<typeof testSchema>

const testQueues = [
  { queueId: QUEUE_ID, jobPayloadSchema: testSchema, queueOptions: { retryLimit: 0 } },
] as const satisfies QueueConfiguration[]
type TestQueues = typeof testQueues

type ProcessFn = (jobs: PgBossJob<TestPayload>[]) => BatchOutcome

class TestBatchProcessor extends AbstractPgBossBatchJobProcessor<TestQueues, typeof QUEUE_ID> {
  public readonly processedEntityIds: string[] = []
  public readonly requestContexts: RequestContext[] = []
  private readonly onProcess: ProcessFn

  constructor(
    dependencies: PgBossJobProcessorDependencies<TestQueues>,
    onProcess: ProcessFn = allJobsSucceeded,
    batchSize = 1,
  ) {
    super(dependencies, {
      queueId: QUEUE_ID,
      ownerName: 'test-owner',
      workerOptions: { batchSize },
    })
    this.onProcess = onProcess
  }

  protected process(
    jobs: PgBossJob<TestPayload>[],
    requestContext: RequestContext,
  ): Promise<BatchOutcome> {
    this.processedEntityIds.push(...jobs.map((job) => job.data.entityId))
    this.requestContexts.push(requestContext)
    return Promise.resolve(this.onProcess(jobs))
  }
}

const payload = (entityId: string = randomUUID(), correlationId = 'corr') => ({
  entityId,
  metadata: { correlationId },
})

describe('AbstractPgBossBatchJobProcessor', () => {
  let manager: PgBossQueueManager<TestQueues>
  let processor: TestBatchProcessor | undefined
  let report: Mock<ErrorReporter['report']>
  let transactionObservabilityManager: ReturnType<typeof buildFakeTransactionObservabilityManager>
  let deps: PgBossJobProcessorDependencies<TestQueues>

  beforeAll(async () => {
    manager = buildTestQueueManager(testQueues)
    await manager.start()
    await manager.provisionQueues()
  })

  beforeEach(async () => {
    await manager.boss.deleteQueuedJobs(QUEUE_ID)
    await manager.boss.deleteQueuedJobs(DLQ_ID)
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

  it('completes the batch in one transaction and hands process the validated payloads', async () => {
    // Queued before the processor starts, so one fetch takes both as a single batch.
    const jobIds = await manager.scheduleBulk(QUEUE_ID, [
      payload('a', 'corr-a'),
      payload('b', 'corr-b'),
    ])
    processor = new TestBatchProcessor(deps, allJobsSucceeded, 2)
    await processor.start()

    for (const jobId of jobIds) await processor.spy.waitForJobWithId(jobId, 'completed')

    // pg-boss does not order the jobs within a batch, so neither do these assertions.
    expect(processor.processedEntityIds.toSorted()).toEqual(['a', 'b'])
    expect(processor.requestContexts).toHaveLength(1)
    expect(['corr-a', 'corr-b']).toContain(processor.requestContexts[0]?.reqId)
    expect(transactionObservabilityManager.start).toHaveBeenCalledTimes(1)
    const [transactionName, transactionKey] = transactionObservabilityManager.start.mock.calls[0]!
    expect(transactionName).toBe(`bg_job:test-owner:${QUEUE_ID}`)
    expect(jobIds).toContain(transactionKey)
    expect(transactionObservabilityManager.stop).toHaveBeenCalledWith(transactionKey, true)
  })

  it('dead-letters an invalid payload sharing a batch with valid ones', async () => {
    // The request context is built before validation, so it has to cope with the raw invalid one.
    const invalidJobId = (await manager.boss.send(QUEUE_ID, { entityId: 'no-metadata' })) as string
    const validJobId = await manager.schedule(QUEUE_ID, payload('valid'))
    processor = new TestBatchProcessor(deps, allJobsSucceeded, 2)
    await processor.start()

    await processor.spy.waitForJobWithId(validJobId, 'completed')
    const invalidJob = await waitForJobState(manager, QUEUE_ID, invalidJobId, 'failed')

    expect(processor.processedEntityIds).toEqual(['valid'])
    expect(invalidJob.output).toMatchObject({ reason: 'Job payload failed schema validation' })
    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ context: expect.objectContaining({ jobId: invalidJobId }) }),
    )
    expect(transactionObservabilityManager.stop).toHaveBeenCalledWith(expect.any(String), false)
    const [deadLettered] = await manager.boss.fetch<TestPayload>(DLQ_ID)
    expect(deadLettered?.data).toEqual({ entityId: 'no-metadata' })
  })

  it('fails only the jobs process reports and completes the rest of the batch', async () => {
    const [poisonJobId, healthyJobId] = await manager.scheduleBulk(QUEUE_ID, [
      payload('poison'),
      payload('healthy'),
    ])
    processor = new TestBatchProcessor(
      deps,
      (jobs) =>
        someJobsFailed(
          jobs,
          new Map(
            jobs
              .filter((job) => job.data.entityId === 'poison')
              .map((job) => [job.id, new Error('poison')]),
          ),
        ),
      2,
    )
    await processor.start()

    await processor.spy.waitForJobWithId(healthyJobId!, 'completed')
    const failed = await waitForJobState(manager, QUEUE_ID, poisonJobId!, 'failed')

    expect(failed.output).toMatchObject({ message: 'poison' })
    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ message: 'poison' }),
        context: expect.objectContaining({ jobId: poisonJobId }),
      }),
    )
  })

  it('dead-letters a job process fails with an UnrecoverableError', async () => {
    const jobId = await manager.schedule(QUEUE_ID, payload('unrecoverable'))
    processor = new TestBatchProcessor(deps, (jobs) =>
      someJobsFailed(jobs, new Map(jobs.map((job) => [job.id, new UnrecoverableError('nope')]))),
    )
    await processor.start()

    await waitForJobState(manager, QUEUE_ID, jobId, 'failed')

    const [deadLettered] = await manager.boss.fetch<TestPayload>(DLQ_ID)
    expect(deadLettered?.data.entityId).toBe('unrecoverable')
  })

  it('fails the whole batch with a short summary when process throws', async () => {
    const jobId = await manager.schedule(QUEUE_ID, payload())
    processor = new TestBatchProcessor(deps, () => {
      throw new Error('boom')
    })
    await processor.start()

    const failed = await waitForJobState(manager, QUEUE_ID, jobId, 'failed')

    expect(failed.output).toEqual({ name: 'Error', message: 'boom' })
    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ message: 'boom' }) }),
    )
  })

  it('reports a batch-wide failure once, not once per job', async () => {
    const jobIds = await manager.scheduleBulk(QUEUE_ID, [payload(), payload()])
    processor = new TestBatchProcessor(
      deps,
      () => {
        throw new Error('boom')
      },
      2,
    )
    await processor.start()

    for (const jobId of jobIds) await waitForJobState(manager, QUEUE_ID, jobId, 'failed')

    expect(processor.requestContexts).toHaveLength(1)
    expect(report).toHaveBeenCalledTimes(1)
  })

  it('fails the whole batch when process reports a job id from outside it', async () => {
    const strayJobId = randomUUID()
    const jobId = await manager.schedule(QUEUE_ID, payload())
    processor = new TestBatchProcessor(deps, (jobs) => ({
      succeededJobIds: jobs.map((job) => job.id),
      failedJobs: new Map([[strayJobId, new Error('mis-keyed')]]),
    }))
    await processor.start()

    const failed = await waitForJobState(manager, QUEUE_ID, jobId, 'failed')

    expect(failed.output).toMatchObject({
      message: expect.stringContaining(`unknown or repeated job ids [${strayJobId}]`),
    })
    expect(report).toHaveBeenCalledTimes(1)
  })

  it('fails the whole batch when process leaves a job without a verdict', async () => {
    const jobId = await manager.schedule(QUEUE_ID, payload())
    processor = new TestBatchProcessor(deps, () => ({ succeededJobIds: [], failedJobs: new Map() }))
    await processor.start()

    const failed = await waitForJobState(manager, QUEUE_ID, jobId, 'failed')

    expect(failed.output).toMatchObject({
      message: expect.stringContaining(`jobs left without a verdict [${jobId}]`),
    })
  })
})
