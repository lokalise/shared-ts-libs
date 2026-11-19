import type { ConstructorOptions, Queue, SendOptions } from 'pg-boss'
import type { z } from 'zod/v4'
import type { BaseJobPayload } from '../types.ts'

/**
 * Options a queue is created with. `name` comes from `queueId`, and `deadLetter` is always the
 * queue's own `<queueId>-dlq` (see {@link deadLetterQueueNameBuilder}).
 */
export type PgBossQueueOptions = Omit<Queue, 'name' | 'deadLetter'>

/** Per-job options. `db` is per call, so it is accepted on `schedule` only, never as a default. */
export type PgBossJobOptions = Omit<SendOptions, 'db'>

export type QueueConfiguration<QueueId extends string = string> = {
  queueId: QueueId
  /**
   * Zod schema every job payload on this queue is parsed with. Registration precompiles it, so the
   * schema the library actually parses with is a compiled clone of the one you pass here.
   */
  jobPayloadSchema: z.ZodType<BaseJobPayload>
  /**
   * Applied by {@link PgBossQueueManager.provisionQueues}. Retry, expiration and retention settings
   * set here are inherited by every job on the queue unless the job overrides them.
   */
  queueOptions?: PgBossQueueOptions
  /**
   * Defaults for every job scheduled on this queue, merged under the options passed to `schedule`.
   * Can be a function of the parsed payload, e.g. to derive a `singletonKey` or a `group`.
   */
  jobOptions?:
    | PgBossJobOptions
    // biome-ignore lint/suspicious/noExplicitAny: the payload type is not known here, it is validated at runtime
    | ((payload: any) => PgBossJobOptions)
}

export type SupportedQueueIds<Config extends readonly QueueConfiguration[]> =
  Config[number]['queueId']

export type QueueConfigurationForQueue<
  Config extends readonly QueueConfiguration[],
  QueueId extends SupportedQueueIds<Config>,
> = Extract<Config[number], { queueId: QueueId }>

/** Producer-facing payload: the schema input. */
export type JobPayloadInputForQueue<
  Config extends readonly QueueConfiguration[],
  QueueId extends SupportedQueueIds<Config>,
> = z.input<QueueConfigurationForQueue<Config, QueueId>['jobPayloadSchema']>

/** Processor-facing payload: the parsed schema output. */
export type JobPayloadForQueue<
  Config extends readonly QueueConfiguration[],
  QueueId extends SupportedQueueIds<Config>,
> = z.infer<QueueConfigurationForQueue<Config, QueueId>['jobPayloadSchema']>

export type PgBossQueueManagerConfig = {
  /**
   * Enables pg-boss job spies, and in place of the queue's retry delay and backoff retries a failed
   * job immediately, so tests do not wait on the clock.
   */
  isTest: boolean
  /**
   * When enabled (default), `schedule` and the other producer methods start the manager on first
   * use. Disable it to make a call on a manager that was never started throw instead.
   */
  lazyInitEnabled?: boolean
  /** Passed to the `PgBoss` constructor as is. `__test__enableSpies` follows `isTest`. */
  pgBossOptions: Omit<ConstructorOptions, '__test__enableSpies'>
}
