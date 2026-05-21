import type {
  FlowChildJob,
  FlowJob,
  FlowOpts,
  FlowProducer,
  JobNode,
  JobsOptions,
  NodeOpts,
  Queue,
  QueueBaseOptions,
  QueueOptions,
} from 'bullmq'
import { merge } from 'ts-deepmerge'
import type { BullmqFlowProducerFactory } from '../factories/BullmqFlowProducerFactory.ts'
import { enrichRedisConfig, sanitizeRedisConfig } from '../public-utils/index.ts'
import { BackgroundJobProcessorSpy } from '../spy/BackgroundJobProcessorSpy.ts'
import type { BackgroundJobProcessorSpyInterface } from '../spy/types.ts'
import { prepareJobOptions, resolveQueueId } from '../utils.ts'
import type { QueueManager } from './QueueManager.ts'
import type { QueueConfigRegistry } from './QueueRegistry.ts'
import type {
  JobPayloadForQueue,
  JobPayloadInputForQueue,
  QueueConfiguration,
  QueueManagerConfig,
  SupportedJobPayloads,
  SupportedQueueIds,
} from './types.ts'

/**
 * Options accepted on a child flow node. Mirrors BullMQ's `FlowChildJob.opts`:
 * `debounce`, `deduplication`, `parent` and `repeat` are not supported on children.
 */
export type FlowChildJobOptions = Omit<
  JobsOptions,
  'debounce' | 'deduplication' | 'parent' | 'repeat'
>

/**
 * Options accepted on a root flow node. Mirrors BullMQ's `FlowJob.opts`:
 * `repeat` is not supported on flow roots (use `Queue.add` for repeatable jobs).
 */
export type FlowRootJobOptions = Omit<JobsOptions, 'repeat'>

/**
 * Typed flow child node. The `queueId` discriminates which queue's payload
 * schema is required on `data`.
 */
export type FlowChildJobInput<
  Queues extends QueueConfiguration[],
  QueueId extends SupportedQueueIds<Queues> = SupportedQueueIds<Queues>,
> = {
  [Id in QueueId]: {
    queueId: Id
    /** Defaults to `queueId` when omitted, matching `QueueManager.schedule`. */
    name?: string
    data: JobPayloadInputForQueue<Queues, Id>
    opts?: FlowChildJobOptions
    children?: FlowChildJobInput<Queues>[]
  }
}[QueueId]

/**
 * Typed flow root node. Root jobs may carry `deduplication`/`debounce`
 * (children may not — see {@link FlowChildJobInput}).
 */
export type FlowJobInput<
  Queues extends QueueConfiguration[],
  QueueId extends SupportedQueueIds<Queues> = SupportedQueueIds<Queues>,
> = {
  [Id in QueueId]: {
    queueId: Id
    name?: string
    data: JobPayloadInputForQueue<Queues, Id>
    opts?: FlowRootJobOptions
    children?: FlowChildJobInput<Queues>[]
  }
}[QueueId]

/** Configuration accepted by {@link FlowManager}. Mirrors {@link QueueManagerConfig}. */
export type FlowManagerConfig = QueueManagerConfig

const stripChildOnlyFields = (opts: JobsOptions): JobsOptions => {
  const next: JobsOptions = { ...opts }
  delete next.deduplication
  delete next.debounce
  delete next.parent
  delete next.repeat
  return next
}

/**
 * Manages a BullMQ {@link FlowProducer} backed by the same {@link QueueConfigRegistry}
 * used by {@link QueueManager}. Provides the same guarantees as
 * `QueueManager.schedule`: Zod-validated payloads, merged job options + default
 * retry/retention, deduplication `idBuilder` resolution (root only — BullMQ
 * does not allow deduplication on flow children), dashboard grouping via
 * `resolveQueueId`, spy support in test mode, and lazy initialization.
 *
 * Wire it with the registry your {@link QueueManager} already owns — the registry
 * is the single source of truth for queue names and dashboard grouping, so a
 * `FlowManager` paired with a `ModuleAwareQueueManager` inherits the
 * `[serviceId, moduleId]` grouping automatically. The recommended interop entry
 * point is {@link FlowManager.fromQueueManager}; pass a freshly-built
 * {@link QueueConfigRegistry} to the regular constructor for publish-only
 * services that don't run a `QueueManager`.
 */
export class FlowManager<
  Queues extends QueueConfiguration<QueueOptionsType, JobOptionsType>[],
  FlowProducerType extends FlowProducer = FlowProducer,
  FlowProducerOptionsType extends QueueBaseOptions = QueueBaseOptions,
  QueueOptionsType extends QueueOptions = QueueOptions,
  JobOptionsType extends JobsOptions = JobsOptions,
> {
  public readonly config: FlowManagerConfig

  protected readonly queueRegistry: QueueConfigRegistry<Queues, QueueOptionsType, JobOptionsType>

  private readonly flowProducerFactory: BullmqFlowProducerFactory<
    FlowProducerType,
    FlowProducerOptionsType
  >

  private readonly spies: Record<
    SupportedQueueIds<Queues>,
    BackgroundJobProcessorSpy<
      JobPayloadForQueue<Queues, SupportedQueueIds<Queues>>,
      // biome-ignore lint/suspicious/noExplicitAny: spy return type is unknown here
      any
    >
    // biome-ignore lint/suspicious/noExplicitAny: matches the value type above
  > = {} as Record<SupportedQueueIds<Queues>, BackgroundJobProcessorSpy<any, any>>

  // Reverse lookup of resolved queueName (including dashboard grouping) ->
  // queueId, so `recordNode` doesn't rescan every queue config per node.
  private readonly queueIdByResolvedName: Map<string, SupportedQueueIds<Queues>>

  private flowProducer?: FlowProducerType
  private startPromise?: Promise<void>

  constructor(
    flowProducerFactory: BullmqFlowProducerFactory<FlowProducerType, FlowProducerOptionsType>,
    queueRegistry: QueueConfigRegistry<Queues, QueueOptionsType, JobOptionsType>,
    config: FlowManagerConfig,
  ) {
    this.queueRegistry = queueRegistry
    this.flowProducerFactory = flowProducerFactory
    this.config = config

    this.queueIdByResolvedName = new Map()
    for (const queueId of queueRegistry.queueIds) {
      const typedQueueId = queueId as SupportedQueueIds<Queues>
      const queueConfig = queueRegistry.getQueueConfig(typedQueueId)
      this.queueIdByResolvedName.set(resolveQueueId(queueConfig), typedQueueId)
    }

    if (config.isTest) {
      for (const queueId of queueRegistry.queueIds) {
        this.spies[queueId as SupportedQueueIds<Queues>] = new BackgroundJobProcessorSpy()
      }
    }
  }

  /**
   * Convenience factory that pairs a `FlowManager` to an existing `QueueManager`,
   * sharing its registry. Use this when you have a `QueueManager` instance handy —
   * TypeScript infers `Queues` cleanly through it (which it does not always do when
   * passing `queueManager.queueRegistry` to the regular constructor, especially
   * for `ModuleAwareQueueManager` registries).
   */
  public static fromQueueManager<
    Queues extends QueueConfiguration<QueueOptionsType, JobOptionsType>[],
    QueueType extends Queue<
      SupportedJobPayloads<Queues>,
      unknown,
      string,
      SupportedJobPayloads<Queues>,
      unknown,
      string
    >,
    QueueOptionsType extends QueueOptions,
    JobOptionsType extends JobsOptions,
    FlowProducerType extends FlowProducer = FlowProducer,
    FlowProducerOptionsType extends QueueBaseOptions = QueueBaseOptions,
  >(
    flowProducerFactory: BullmqFlowProducerFactory<FlowProducerType, FlowProducerOptionsType>,
    queueManager: QueueManager<Queues, QueueType, QueueOptionsType, JobOptionsType>,
    config: FlowManagerConfig,
  ): FlowManager<
    Queues,
    FlowProducerType,
    FlowProducerOptionsType,
    QueueOptionsType,
    JobOptionsType
  > {
    return new FlowManager<
      Queues,
      FlowProducerType,
      FlowProducerOptionsType,
      QueueOptionsType,
      JobOptionsType
    >(flowProducerFactory, queueManager.queueRegistry, config)
  }

  public async start(): Promise<void> {
    if (this.flowProducer) return
    if (!this.startPromise) this.startPromise = this.doStart()
    try {
      await this.startPromise
    } finally {
      this.startPromise = undefined
    }
  }

  public async dispose(): Promise<void> {
    // Wait for any in-flight start so we don't leak a producer that gets
    // assigned to `this.flowProducer` right after dispose returns.
    if (this.startPromise) {
      try {
        await this.startPromise
      } catch {
        // start failure already surfaced to its caller; nothing to dispose
      }
    }
    if (!this.flowProducer) return
    try {
      await this.flowProducer.close()
      /* v8 ignore start */
    } catch {
      // do nothing
    }
    /* v8 ignore stop */
    this.flowProducer = undefined
  }

  public get isStarted(): boolean {
    return this.flowProducer !== undefined
  }

  public getSpy<QueueId extends SupportedQueueIds<Queues>, JobReturn = unknown>(
    queueId: QueueId,
  ): BackgroundJobProcessorSpyInterface<JobPayloadForQueue<Queues, QueueId>, JobReturn> {
    if (!this.spies[queueId])
      throw new Error(
        `${queueId} spy was not instantiated, it is only available on test mode. Please use \`config.isTest\` to enable it on FlowManager`,
      )

    return this.spies[queueId]
  }

  public async addFlow<QueueId extends SupportedQueueIds<Queues>>(
    flow: FlowJobInput<Queues, QueueId>,
    opts?: FlowOpts,
  ): Promise<JobNode> {
    // Validate and resolve queue names up front so invalid payloads fail fast,
    // before any network round-trip (matches `QueueManager.schedule`).
    const rootFlowJob = this.buildRootFlowJob(flow)

    await this.startIfNotStarted()

    const node = await this.getFlowProducer().add(rootFlowJob, opts)
    this.recordNode(node)
    return node
  }

  public async addFlowBulk(flows: FlowJobInput<Queues>[]): Promise<JobNode[]> {
    if (flows.length === 0) return []
    const rootFlowJobs = flows.map((flow) => this.buildRootFlowJob(flow))

    await this.startIfNotStarted()

    const nodes = await this.getFlowProducer().addBulk(rootFlowJobs)
    for (const node of nodes) this.recordNode(node)
    return nodes
  }

  /**
   * Fetch a flow tree by its root job. Uses the queue config's resolved name so
   * dashboard-grouped queues are looked up correctly.
   */
  public async getFlow(
    opts: Omit<NodeOpts, 'queueName'> & { queueId: SupportedQueueIds<Queues> },
  ): Promise<JobNode> {
    const { queueId, ...rest } = opts
    const queueName = resolveQueueId(this.queueRegistry.getQueueConfig(queueId))

    await this.startIfNotStarted()
    return this.getFlowProducer().getFlow({ ...rest, queueName })
  }

  private async doStart(): Promise<void> {
    const options = {
      connection: sanitizeRedisConfig(enrichRedisConfig(this.config.redisConfig)),
      prefix: this.config.redisConfig.keyPrefix ?? undefined,
    } as unknown as FlowProducerOptionsType
    const flowProducer = this.flowProducerFactory.buildFlowProducer(options)
    try {
      await flowProducer.waitUntilReady()
    } catch (error) {
      // `new FlowProducer(...)` already opened an ioredis connection — close it
      // so a failed start doesn't leak the underlying client.
      /* v8 ignore start */
      try {
        await flowProducer.close()
      } catch {
        // swallow; surfacing the original error is more useful
      }
      /* v8 ignore stop */
      throw error
    }
    this.flowProducer = flowProducer
  }

  private buildRootFlowJob<QueueId extends SupportedQueueIds<Queues>>(
    flow: FlowJobInput<Queues, QueueId>,
  ): FlowJob {
    const { queueId, name, data, opts, children } = flow
    const queueConfig = this.queueRegistry.getQueueConfig(queueId)
    const parsedData = queueConfig.jobPayloadSchema.parse(data) as SupportedJobPayloads<Queues>

    return {
      name: name ?? queueId,
      queueName: resolveQueueId(queueConfig),
      data: parsedData,
      opts: this.resolveRootJobOptions(queueId, parsedData, opts),
      children: children?.map((child) => this.buildChildFlowJob(child)),
    }
  }

  private buildChildFlowJob<QueueId extends SupportedQueueIds<Queues>>(
    flow: FlowChildJobInput<Queues, QueueId>,
  ): FlowChildJob {
    const { queueId, name, data, opts, children } = flow
    const queueConfig = this.queueRegistry.getQueueConfig(queueId)
    const parsedData = queueConfig.jobPayloadSchema.parse(data) as SupportedJobPayloads<Queues>

    return {
      name: name ?? queueId,
      queueName: resolveQueueId(queueConfig),
      data: parsedData,
      opts: this.resolveChildJobOptions(queueId, parsedData, opts),
      children: children?.map((child) => this.buildChildFlowJob(child)),
    }
  }

  private resolveRootJobOptions<QueueId extends SupportedQueueIds<Queues>>(
    queueId: QueueId,
    jobPayload: JobPayloadForQueue<Queues, QueueId>,
    options?: FlowRootJobOptions,
  ): FlowRootJobOptions {
    const queueConfig = this.queueRegistry.getQueueConfig(queueId)

    const defaultOptions =
      typeof queueConfig.jobOptions === 'function'
        ? queueConfig.jobOptions(jobPayload)
        : queueConfig.jobOptions

    const resolvedOptions = merge(defaultOptions ?? {}, options ?? {}) as JobOptionsType

    if (defaultOptions?.deduplication && !options?.deduplication) {
      const deduplicationId =
        'id' in defaultOptions.deduplication
          ? defaultOptions.deduplication.id
          : defaultOptions.deduplication.idBuilder(jobPayload)
      if (!deduplicationId || deduplicationId.trim().length === 0) {
        throw new Error('Invalid deduplication id')
      }

      resolvedOptions.deduplication = {
        ...resolvedOptions.deduplication,
        id: deduplicationId,
      }
    }

    return prepareJobOptions(this.config.isTest, resolvedOptions)
  }

  private resolveChildJobOptions<QueueId extends SupportedQueueIds<Queues>>(
    queueId: QueueId,
    jobPayload: JobPayloadForQueue<Queues, QueueId>,
    options?: FlowChildJobOptions,
  ): FlowChildJobOptions {
    const queueConfig = this.queueRegistry.getQueueConfig(queueId)

    const rawDefaults =
      typeof queueConfig.jobOptions === 'function'
        ? queueConfig.jobOptions(jobPayload)
        : queueConfig.jobOptions

    // Children cannot carry deduplication/debounce/parent/repeat — strip these
    // from both queue-level defaults and the per-call options. TypeScript blocks
    // the latter, but a JS caller (or `as any` cast) could still smuggle them
    // through to BullMQ where they misbehave on flow children.
    const defaultOptions = stripChildOnlyFields((rawDefaults ?? {}) as JobsOptions)
    const callerOptions = stripChildOnlyFields((options ?? {}) as JobsOptions)

    const resolvedOptions = merge(defaultOptions, callerOptions) as JobOptionsType
    return prepareJobOptions(this.config.isTest, resolvedOptions)
  }

  private recordNode(node: JobNode): void {
    const job = node.job
    if (job?.id) {
      const queueId = this.queueIdByResolvedName.get(job.queueName)
      if (queueId && this.spies[queueId]) {
        this.spies[queueId].addJob(job, 'scheduled')
      }
    }

    if (node.children?.length) {
      for (const child of node.children) this.recordNode(child)
    }
  }

  private getFlowProducer(): FlowProducerType {
    /* v8 ignore start */
    if (!this.flowProducer) {
      throw new Error('FlowManager not started, please call `start` or enable lazy init')
    }
    /* v8 ignore stop */
    return this.flowProducer
  }

  private startIfNotStarted(): Promise<void> {
    if (!this.isStarted && this.config.lazyInitEnabled === false) {
      throw new Error('FlowManager not started, please call `start` or enable lazy init')
    }
    return this.start()
  }
}
