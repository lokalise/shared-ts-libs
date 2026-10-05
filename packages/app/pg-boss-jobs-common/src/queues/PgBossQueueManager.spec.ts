import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { z } from 'zod/v4'
import {
  buildTestQueueManager,
  getPersistedJob,
  getTestPgBossOptions,
  silentLogger,
} from '../../test/testUtils.ts'
import { BASE_JOB_PAYLOAD_SCHEMA } from '../types.ts'
import { PgBossQueueManager } from './PgBossQueueManager.ts'
import type { QueueConfiguration } from './types.ts'
import { deadLetterQueueNameBuilder } from './utils.ts'

const QUEUE_ID = 'manager_test'
const DERIVED_OPTIONS_QUEUE_ID = 'manager_test_derived_options'

const testSchema = BASE_JOB_PAYLOAD_SCHEMA.extend({
  entityId: z.string(),
  priority: z.number().default(0),
})

const testQueues = [
  { queueId: QUEUE_ID, jobPayloadSchema: testSchema, queueOptions: { retryLimit: 3 } },
  {
    queueId: DERIVED_OPTIONS_QUEUE_ID,
    jobPayloadSchema: testSchema,
    jobOptions: (payload: z.infer<typeof testSchema>) => ({
      singletonKey: payload.entityId,
      priority: payload.priority,
    }),
  },
] as const satisfies QueueConfiguration[]

const payload = (entityId: string = randomUUID(), correlationId = 'corr') => ({
  entityId,
  metadata: { correlationId },
})

describe('PgBossQueueManager', () => {
  describe('lifecycle', () => {
    it('does not start when disabled', async () => {
      const manager = buildTestQueueManager(testQueues)

      await manager.start(false)
      await manager.start([])

      expect(manager.isStarted).toBe(false)
      expect(() => manager.boss).toThrow('PgBossQueueManager is not started')
    })

    it('throws instead of starting lazily when lazy init is disabled', async () => {
      const manager = buildTestQueueManager(testQueues, { lazyInitEnabled: false })

      await expect(manager.schedule(QUEUE_ID, payload())).rejects.toThrow(
        'PgBossQueueManager is not started, please call `start` or enable lazy init',
      )
      await expect(manager.getJobCount(QUEUE_ID)).rejects.toThrow(
        'PgBossQueueManager is not started',
      )
    })

    it('starts on first use, once, when called concurrently', async () => {
      const manager = buildTestQueueManager(testQueues)

      await Promise.all([manager.start(), manager.start(), manager.getJobCount(QUEUE_ID)])

      expect(manager.isStarted).toBe(true)
      await manager.dispose()
      expect(manager.isStarted).toBe(false)
      await expect(manager.dispose()).resolves.toBeUndefined()
    })

    it('stops a start that is still in flight when disposed', async () => {
      const manager = buildTestQueueManager(testQueues)

      const starting = manager.start()
      await manager.dispose()
      await starting

      expect(manager.isStarted).toBe(false)
    })

    it('lets a failed start be retried', async () => {
      const manager = new PgBossQueueManager(testQueues, {
        isTest: true,
        pgBossOptions: {
          ...getTestPgBossOptions(),
          connectionString: 'postgres://nope@127.0.0.1:1/x',
        },
      })

      await expect(manager.start()).rejects.toThrow()
      await expect(manager.start()).rejects.toThrow()
      expect(manager.isStarted).toBe(false)
    })
  })

  describe('running', () => {
    let manager: PgBossQueueManager<typeof testQueues>

    beforeAll(async () => {
      manager = buildTestQueueManager(testQueues)
      await manager.start()
      await manager.provisionQueues()
    })

    afterAll(async () => {
      await manager.dispose()
    })

    it('provisions each queue wired to its dead letter queue, and is safe to rerun', async () => {
      await manager.provisionQueues()

      const queue = await manager.boss.getQueue(QUEUE_ID)
      const deadLetterQueue = await manager.boss.getQueue(deadLetterQueueNameBuilder(QUEUE_ID))

      expect(queue).toMatchObject({ deadLetter: `${QUEUE_ID}-dlq`, retryLimit: 3 })
      expect(deadLetterQueue).not.toBeNull()
    })

    it('reports a successful probe', async () => {
      await expect(manager.probe()).resolves.toBeGreaterThanOrEqual(0)
    })

    describe('schedule', () => {
      it('enqueues the parsed payload and returns the job id', async () => {
        const entityId = randomUUID()
        const spy = manager.getSpy(QUEUE_ID)

        const jobId = await manager.schedule(QUEUE_ID, payload(entityId))

        const job = await spy.waitForJobWithId(jobId, 'created')
        // `priority` comes from the schema default, so the stored payload is the parsed one.
        expect(job.data).toEqual({ ...payload(entityId), priority: 0 })
      })

      it('rejects an invalid payload without enqueuing anything', async () => {
        const countBefore = await manager.getJobCount(QUEUE_ID)

        // @ts-expect-error - the envelope is missing
        await expect(manager.schedule(QUEUE_ID, { entityId: 'x' })).rejects.toThrow()

        expect(await manager.getJobCount(QUEUE_ID)).toBe(countBefore)
      })

      it('applies queue job options derived from the payload, under the call options', async () => {
        const entityId = randomUUID()

        const jobId = await manager.schedule(DERIVED_OPTIONS_QUEUE_ID, {
          ...payload(entityId),
          priority: 5,
        })
        const overriddenId = await manager.schedule(
          DERIVED_OPTIONS_QUEUE_ID,
          { ...payload(), priority: 5 },
          { priority: 9 },
        )

        const job = await getPersistedJob(manager, DERIVED_OPTIONS_QUEUE_ID, jobId)
        expect(job).toMatchObject({ singletonKey: entityId, priority: 5 })
        const overridden = await getPersistedJob(manager, DERIVED_OPTIONS_QUEUE_ID, overriddenId)
        expect(overridden?.priority).toBe(9)
      })

      it('overrides retry delay and backoff in test mode', async () => {
        const jobId = await manager.schedule(QUEUE_ID, payload(), {
          retryDelay: 60,
          retryBackoff: true,
        })

        const job = await getPersistedJob(manager, QUEUE_ID, jobId)
        expect(job).toMatchObject({ retryDelay: 0, retryBackoff: false })
      })

      it('throws when pg-boss drops the job on a singleton conflict', async () => {
        const options = { singletonKey: randomUUID(), singletonSeconds: 60 }

        await expect(manager.schedule(QUEUE_ID, payload(), options)).resolves.toEqual(
          expect.any(String),
        )
        await expect(manager.schedule(QUEUE_ID, payload(), options)).rejects.toThrow(
          `Job was not scheduled on queue "${QUEUE_ID}"`,
        )
      })

      it('enqueues inside a transaction, visible only once it commits', async () => {
        const committed = await manager.boss.getDb().beginTransaction!()
        const committedId = await manager.schedule(QUEUE_ID, payload(), { db: committed.db })
        expect(await getPersistedJob(manager, QUEUE_ID, committedId)).toBeNull()
        await committed.commit()

        const rolledBack = await manager.boss.getDb().beginTransaction!()
        const rolledBackId = await manager.schedule(QUEUE_ID, payload(), { db: rolledBack.db })
        await rolledBack.rollback()

        expect(await getPersistedJob(manager, QUEUE_ID, committedId)).not.toBeNull()
        expect(await getPersistedJob(manager, QUEUE_ID, rolledBackId)).toBeNull()
      })
    })

    describe('scheduleBulk', () => {
      it('is a no-op for an empty array', async () => {
        await expect(manager.scheduleBulk(QUEUE_ID, [])).resolves.toEqual([])
      })

      it('enqueues every job in one insert, in input order, with per-job options', async () => {
        const groupId = randomUUID()
        const entityIds = [randomUUID(), randomUUID(), randomUUID()]

        const jobIds = await manager.scheduleBulk(
          QUEUE_ID,
          entityIds.map((entityId) => payload(entityId)),
          { jobOptions: (data) => ({ singletonKey: data.entityId, group: { id: groupId } }) },
        )

        expect(jobIds).toHaveLength(3)
        const jobs = await Promise.all(
          jobIds.map((jobId) => getPersistedJob(manager, QUEUE_ID, jobId)),
        )
        expect(jobs.map((job) => job?.singletonKey)).toEqual(entityIds)
        expect(jobs.map((job) => job?.groupId)).toEqual([groupId, groupId, groupId])
      })

      it('applies queue job options and shared options', async () => {
        const entityId = randomUUID()

        const [jobId] = await manager.scheduleBulk(
          DERIVED_OPTIONS_QUEUE_ID,
          [{ ...payload(entityId), priority: 3 }],
          { jobOptions: { retryLimit: 7 } },
        )

        const job = await getPersistedJob(manager, DERIVED_OPTIONS_QUEUE_ID, jobId!)
        expect(job).toMatchObject({ singletonKey: entityId, priority: 3, retryLimit: 7 })
      })

      it('rejects the whole batch when any payload is invalid', async () => {
        const countBefore = await manager.getJobCount(QUEUE_ID)

        await expect(
          // @ts-expect-error - the second payload lacks its envelope
          manager.scheduleBulk(QUEUE_ID, [payload(), { entityId: 'x' }]),
        ).rejects.toThrow()

        expect(await manager.getJobCount(QUEUE_ID)).toBe(countBefore)
      })

      it('does not persist jobs whose transaction rolls back', async () => {
        const transaction = await manager.boss.getDb().beginTransaction!()
        const jobIds = await manager.scheduleBulk(QUEUE_ID, [payload(), payload()], {
          db: transaction.db,
        })
        await transaction.rollback()

        for (const jobId of jobIds) {
          expect(await getPersistedJob(manager, QUEUE_ID, jobId)).toBeNull()
        }
      })
    })

    describe('getJobCount', () => {
      it('counts the jobs waiting on the queue', async () => {
        await manager.boss.deleteQueuedJobs(QUEUE_ID)
        expect(await manager.getJobCount(QUEUE_ID)).toBe(0)

        await manager.scheduleBulk(QUEUE_ID, [payload(), payload()])

        expect(await manager.getJobCount(QUEUE_ID)).toBe(2)
      })
    })

    describe('recurring schedules', () => {
      it('creates, lists and removes a validated recurring schedule', async () => {
        await manager.scheduleRecurring(QUEUE_ID, '0 3 * * *', payload('nightly'), {
          key: 'nightly',
          tz: 'Europe/Riga',
        })
        await manager.scheduleRecurring(DERIVED_OPTIONS_QUEUE_ID, 'FREQ=HOURLY', payload('hourly'))

        const schedules = await manager.getRecurringSchedules(QUEUE_ID)
        expect(schedules).toEqual([
          expect.objectContaining({
            name: QUEUE_ID,
            key: 'nightly',
            cron: '0 3 * * *',
            timezone: 'Europe/Riga',
            data: { ...payload('nightly'), priority: 0 },
          }),
        ])
        const [derived] = await manager.getRecurringSchedules(DERIVED_OPTIONS_QUEUE_ID)
        expect(derived?.options).toMatchObject({
          singletonKey: 'hourly',
          retryDelay: 0,
          retryBackoff: false,
        })

        await manager.unscheduleRecurring(QUEUE_ID, 'nightly')
        await manager.unscheduleRecurring(DERIVED_OPTIONS_QUEUE_ID)
        expect(await manager.getRecurringSchedules()).toEqual([])
      })

      it('rejects an invalid payload', async () => {
        await expect(
          // @ts-expect-error - the envelope is missing
          manager.scheduleRecurring(QUEUE_ID, '0 3 * * *', { entityId: 'x' }),
        ).rejects.toThrow()
      })
    })
  })

  describe('pg-boss events', () => {
    it('logs and reports errors, and logs warnings', async () => {
      const logger = { ...silentLogger, error: vi.fn(), warn: vi.fn() }
      const report = vi.fn()
      const manager = new PgBossQueueManager(
        testQueues,
        { isTest: true, pgBossOptions: getTestPgBossOptions() },
        { logger: logger as any, errorReporter: { report } },
      )
      await manager.start()

      const workerError = Object.assign(new Error('fetch failed'), {
        queue: QUEUE_ID,
        worker: 'w1',
      })
      manager.boss.emit('error', workerError)
      manager.boss.emit('error', 'not an error' as unknown as Error)
      manager.boss.emit('warning', { message: 'slow', data: {} })
      await manager.dispose()

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ queue: QUEUE_ID, worker: 'w1' }),
        'pg-boss emitted an error',
      )
      expect(report).toHaveBeenCalledWith({
        error: workerError,
        context: { queue: QUEUE_ID, worker: 'w1' },
      })
      expect(report).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ message: 'not an error' }) }),
      )
      expect(logger.warn).toHaveBeenCalledWith(
        { warning: { message: 'slow', data: {} } },
        'pg-boss emitted a warning',
      )
    })
  })

  describe('spies', () => {
    it('are only available in test mode', () => {
      const manager = buildTestQueueManager(testQueues, { isTest: false })

      expect(() => manager.getSpy(QUEUE_ID)).toThrow(
        `${QUEUE_ID} spy is only available in test mode`,
      )
    })
  })

  describe('types', () => {
    const manager = buildTestQueueManager(testQueues)

    it('accepts registered queue ids only', () => {
      expectTypeOf(manager.schedule)
        .parameter(0)
        .toEqualTypeOf<typeof QUEUE_ID | typeof DERIVED_OPTIONS_QUEUE_ID>()
      // @ts-expect-error - unknown queue id
      expectTypeOf(manager.getSpy).toBeCallableWith('missing')
    })
  })
})
