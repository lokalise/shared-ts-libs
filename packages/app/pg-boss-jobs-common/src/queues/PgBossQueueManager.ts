import {
  type CommonLogger,
  type ErrorReporter,
  globalLogger,
  resolveGlobalErrorLogObject,
} from '@lokalise/node-core'
import {
  type Db,
  type JobInsert,
  type JobSpyInterface,
  PgBoss,
  type Schedule,
  type ScheduleOptions,
  type SendOptions,
} from 'pg-boss'
import { normalizeError } from '../errors/utils.ts'
import { QueueRegistry } from './QueueRegistry.ts'
import type {
  JobPayloadForQueue,
  JobPayloadInputForQueue,
  PgBossJobOptions,
  PgBossQueueManagerConfig,
  QueueConfiguration,
  QueueConfigurationForQueue,
  SupportedQueueIds,
} from './types.ts'
import { deadLetterQueueNameBuilder } from './utils.ts'

/**
 * Where pg-boss's own async failures are surfaced. Optional so that scripts and tests can build a
 * manager bare: the listeners are still attached and fall back to the global logger.
 */
export type PgBossQueueManagerDependencies = {
  logger?: CommonLogger
  errorReporter?: ErrorReporter
}

/** Per-job options accepted by {@link PgBossQueueManager.scheduleBulk}. */
export type PgBossJobInsertOptions = Omit<JobInsert, 'data'>

export type BulkScheduleOptions<Payload> = {
  /** Runs the insert inside the caller's transaction, see the README on transactional enqueue. */
  db?: Db
  /** Options for every job, or a function of each job's parsed payload. */
  jobOptions?: PgBossJobInsertOptions | ((payload: Payload) => PgBossJobInsertOptions)
}

/**
 * Forced on every job in test mode: a failed job is retried at once, with no delay and no
 * exponential backoff, so tests do not wait on the clock.
 */
const TEST_JOB_OPTIONS = {
  retryDelay: 0,
  retryBackoff: false,
} as const satisfies PgBossJobOptions

const DEFAULT_SCHEMA = 'pgboss'

export class PgBossQueueManager<const Queues extends readonly QueueConfiguration[]> {
  public readonly config: PgBossQueueManagerConfig
  public readonly queueRegistry: QueueRegistry<Queues>

  private readonly logger: CommonLogger
  private readonly errorReporter?: ErrorReporter
  private _boss?: PgBoss
  private startPromise?: Promise<void>

  constructor(
    queues: Queues,
    config: PgBossQueueManagerConfig,
    dependencies: PgBossQueueManagerDependencies = {},
  ) {
    this.queueRegistry = new QueueRegistry(queues)
    this.config = config
    this.logger = dependencies.logger ?? globalLogger
    this.errorReporter = dependencies.errorReporter
  }

  /** The pg-boss client, for anything this class does not wrap. Throws until the manager starts. */
  get boss(): PgBoss {
    if (!this._boss) throw new Error('PgBossQueueManager is not started, please call `start`')

    return this._boss
  }

  get isStarted(): boolean {
    return !!this._boss
  }

  getQueueConfig<QueueId extends SupportedQueueIds<Queues>>(
    queueId: QueueId,
  ): QueueConfigurationForQueue<Queues, QueueId> {
    return this.queueRegistry.getQueueConfig(queueId)
  }

  /**
   * Starts pg-boss. Every queue shares one pg-boss instance, so the argument only decides whether
   * to start at all: `false` or an empty array skips it, matching `QueueManager.start` in
   * `@lokalise/background-jobs-common` for a service that enables queues selectively.
   */
  async start(enabled: string[] | boolean = true): Promise<void> {
    if (this._boss) return
    if (enabled === false || (Array.isArray(enabled) && enabled.length === 0)) return

    if (!this.startPromise) this.startPromise = this.internalStart()
    try {
      await this.startPromise
    } finally {
      this.startPromise = undefined
    }
  }

  /**
   * Waits for pg-boss to finish the jobs it is running, then stops it. Dispose the processors
   * first: see the README on shutdown order.
   */
  async dispose(): Promise<void> {
    // A start still in flight would otherwise set `_boss` after this returned, leaving pg-boss running.
    if (this.startPromise) await Promise.allSettled([this.startPromise])
    if (!this._boss) return

    await this._boss.stop({ graceful: true })
    this._boss = undefined
  }

  /**
   * Creates every configured queue and its dead letter queue, and applies `queueOptions` to queues
   * that already exist. Safe to run on every deploy.
   */
  async provisionQueues(): Promise<void> {
    const boss = this.boss

    for (const { queueId, queueOptions } of this.queueRegistry.all()) {
      const deadLetter = deadLetterQueueNameBuilder(queueId)
      const options = { ...queueOptions, deadLetter }
      // createQueue does nothing for a queue that exists, so it is the only call that can set
      // `policy` and `partition`; updateQueue applies every later change but rejects those two.
      const { policy: _policy, partition: _partition, ...updatableOptions } = options

      await boss.createQueue(deadLetter)
      await boss.createQueue(queueId, options)
      await boss.updateQueue(queueId, updatableOptions)
    }
  }

  /**
   * Validates the payload and enqueues it. With `options.db` set to a transaction, the job becomes
   * visible only once that transaction commits. Returns the job id.
   */
  async schedule<QueueId extends SupportedQueueIds<Queues>>(
    queueId: QueueId,
    jobPayload: JobPayloadInputForQueue<Queues, QueueId>,
    options?: SendOptions,
  ): Promise<string> {
    const parsedPayload = this.parsePayload(queueId, jobPayload)
    await this.startIfNotStarted()

    const jobId = await this.boss.send(queueId, parsedPayload, {
      ...this.resolveJobOptions(queueId, parsedPayload),
      ...options,
      ...(this.config.isTest ? TEST_JOB_OPTIONS : {}),
    })
    // pg-boss drops a job that a queue policy or a singleton option rejects, and returns null.
    if (jobId === null) throw new Error(`Job was not scheduled on queue "${queueId}"`)

    return jobId
  }

  /**
   * Validates every payload, then enqueues all of them in one insert. A single invalid payload
   * rejects the whole batch before anything is written. Returns the job ids, in input order.
   */
  async scheduleBulk<QueueId extends SupportedQueueIds<Queues>>(
    queueId: QueueId,
    jobPayloads: JobPayloadInputForQueue<Queues, QueueId>[],
    options: BulkScheduleOptions<JobPayloadForQueue<Queues, QueueId>> = {},
  ): Promise<string[]> {
    if (jobPayloads.length === 0) return []

    const parsedPayloads = jobPayloads.map((payload) => this.parsePayload(queueId, payload))
    await this.startIfNotStarted()

    const jobInserts: JobInsert[] = parsedPayloads.map((data) => ({
      ...(this.resolveJobOptions(queueId, data) as PgBossJobInsertOptions),
      ...(typeof options.jobOptions === 'function' ? options.jobOptions(data) : options.jobOptions),
      ...(this.config.isTest ? TEST_JOB_OPTIONS : {}),
      data,
    }))

    const jobIds = await this.boss.insert(queueId, jobInserts, { db: options.db, returnId: true })
    /* v8 ignore start */
    if (!jobIds) throw new Error(`Jobs were not scheduled on queue "${queueId}"`)
    /* v8 ignore stop */

    return jobIds
  }

  /**
   * Creates or replaces a recurring schedule: pg-boss sends a job with this payload every time the
   * cron expression or RFC 5545 recurrence rule comes due, once across every running instance.
   * Requires the `schedule` pg-boss option, which is on by default.
   */
  async scheduleRecurring<QueueId extends SupportedQueueIds<Queues>>(
    queueId: QueueId,
    cronOrRrule: string,
    jobPayload: JobPayloadInputForQueue<Queues, QueueId>,
    options?: ScheduleOptions,
  ): Promise<void> {
    const parsedPayload = this.parsePayload(queueId, jobPayload)
    await this.startIfNotStarted()

    await this.boss.schedule(queueId, cronOrRrule, parsedPayload, {
      ...this.resolveJobOptions(queueId, parsedPayload),
      ...options,
      ...(this.config.isTest ? TEST_JOB_OPTIONS : {}),
    })
  }

  /** Removes a recurring schedule. `key` picks one when the queue has several. */
  async unscheduleRecurring(queueId: SupportedQueueIds<Queues>, key?: string): Promise<void> {
    await this.startIfNotStarted()
    await this.boss.unschedule(queueId, key)
  }

  async getRecurringSchedules(queueId?: SupportedQueueIds<Queues>): Promise<Schedule[]> {
    await this.startIfNotStarted()
    return this.boss.getSchedules(queueId)
  }

  /**
   * Jobs on the queue that are waiting, waiting for a retry, or running. Read from the job table
   * rather than from pg-boss's queue statistics, which are cached for up to a minute.
   */
  async getJobCount(queueId: SupportedQueueIds<Queues>): Promise<number> {
    await this.startIfNotStarted()

    const schema = this.config.pgBossOptions.schema ?? DEFAULT_SCHEMA
    const { rows } = await this.boss
      .getDb()
      .executeSql(
        `SELECT count(*)::int AS count FROM ${schema}.job WHERE name = $1 AND state IN ('created', 'retry', 'active')`,
        [queueId],
      )

    return rows[0]?.count ?? 0
  }

  /**
   * The cheapest round trip that proves the connection works and the schema is installed, for a
   * healthcheck. Resolves with the time it took in milliseconds, and throws on failure.
   */
  async probe(): Promise<number> {
    const startedAt = Date.now()
    await this.boss.schemaVersion()

    return Date.now() - startedAt
  }

  getSpy<QueueId extends SupportedQueueIds<Queues>>(
    queueId: QueueId,
  ): JobSpyInterface<JobPayloadForQueue<Queues, QueueId>> {
    if (!this.config.isTest) {
      throw new Error(
        `${queueId} spy is only available in test mode. Please use \`config.isTest\` to enable it on PgBossQueueManager`,
      )
    }

    return this.boss.getSpy(queueId)
  }

  private parsePayload<QueueId extends SupportedQueueIds<Queues>>(
    queueId: QueueId,
    jobPayload: unknown,
  ): JobPayloadForQueue<Queues, QueueId> {
    return this.queueRegistry
      .getQueueConfig(queueId)
      .jobPayloadSchema.parse(jobPayload) as JobPayloadForQueue<Queues, QueueId>
  }

  private resolveJobOptions<QueueId extends SupportedQueueIds<Queues>>(
    queueId: QueueId,
    parsedPayload: JobPayloadForQueue<Queues, QueueId>,
  ): PgBossJobOptions | undefined {
    const { jobOptions } = this.queueRegistry.getQueueConfig(queueId)

    return typeof jobOptions === 'function' ? jobOptions(parsedPayload) : jobOptions
  }

  private async startIfNotStarted(): Promise<void> {
    if (this._boss) return
    if (this.config.lazyInitEnabled === false) {
      throw new Error('PgBossQueueManager is not started, please call `start` or enable lazy init')
    }

    await this.start()
  }

  private async internalStart(): Promise<void> {
    const boss = new PgBoss({
      ...this.config.pgBossOptions,
      __test__enableSpies: this.config.isTest,
    })

    // pg-boss reports async failures (worker fetch loop, idle pool clients, maintenance) as 'error'
    // events. Without a listener Node rethrows them from the emit site, which crashes the process
    // or kills the fetch loop for good; with one, the worker loop carries on and retries.
    boss.on('error', (error) => {
      const normalized = normalizeError(error)
      const { queue, worker } = normalized as { queue?: string; worker?: string }
      this.logger.error(
        { ...resolveGlobalErrorLogObject(normalized), queue, worker },
        'pg-boss emitted an error',
      )
      this.errorReporter?.report({ error: normalized, context: { queue, worker } })
    })
    // Supervision warns about large backlogs and slow queries, the cheapest stalled-queue signal
    // there is. pg-boss drops a warning nobody listens to.
    boss.on('warning', (warning) => {
      this.logger.warn({ warning }, 'pg-boss emitted a warning')
    })

    try {
      await boss.start()
    } catch (error) {
      // pg-boss keeps the pool and timers of a failed start open until `stop` runs.
      await Promise.allSettled([boss.stop({ graceful: false })])
      throw error
    }
    this._boss = boss
  }
}
