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
import type { BackgroundJobProcessorSpyInterface } from '../spy/types.ts'
import { prepareJobOptions, resolveQueueId } from '../utils.ts'
import type { QueueManager } from './QueueManager.ts'
import type {
  FlowChildJobInput,
  FlowChildJobOptions,
  FlowJobInput,
  FlowManagerConfig,
  FlowRootJobOptions,
  JobPayloadForQueue,
  QueueConfiguration,
  SupportedJobPayloads,
  SupportedQueueIds,
} from './types.ts'

const stripChildOnlyFields = (opts: JobsOptions): JobsOptions => {
  const next: JobsOptions = { ...opts }
  delete next.deduplication
  delete next.debounce
  delete next.parent
  delete next.repeat
  return next
}

/**
 * Manages a BullMQ {@link FlowProducer} paired with an existing {@link QueueManager}.
 * Reuses the QueueManager's registry as the single source of truth for queue
 * configs, names and dashboard grouping, and shares its spy instances so that
 * `queueManager.getSpy(...)`, `flowManager.getSpy(...)` and a worker processor's
 * spy all observe the same job lifecycle.
 *
 * Provides the same guarantees as `QueueManager.schedule`: Zod-validated
 * payloads, merged job options + default retry/retention, deduplication
 * `idBuilder` resolution (root only — BullMQ does not allow deduplication on
 * flow children), dashboard grouping via `resolveQueueId`, and lazy
 * initialization for the FlowProducer connection.
 *
 * A `FlowManager` paired with a `ModuleAwareQueueManager` inherits the
 * `[serviceId, moduleId]` grouping automatically.
 */
export class FlowManager<
  Queues extends QueueConfiguration<QueueOptionsType, JobOptionsType>[],
  QueueType extends Queue<
    SupportedJobPayloads<Queues>,
    unknown,
    string,
    SupportedJobPayloads<Queues>,
    unknown,
    string
  > = Queue<SupportedJobPayloads<Queues>, void, string, SupportedJobPayloads<Queues>, void, string>,
  QueueOptionsType extends QueueOptions = QueueOptions,
  JobOptionsType extends JobsOptions = JobsOptions,
  FlowProducerType extends FlowProducer = FlowProducer,
  FlowProducerOptionsType extends QueueBaseOptions = QueueBaseOptions,
> {
  public readonly config: FlowManagerConfig

  protected readonly queueManager: QueueManager<Queues, QueueType, QueueOptionsType, JobOptionsType>

  private readonly flowProducerFactory: BullmqFlowProducerFactory<
    FlowProducerType,
    FlowProducerOptionsType
  >

  // Reverse lookup of resolved queueName (including dashboard grouping) ->
  // queueId, so `recordNode` doesn't rescan every queue config per node.
  private readonly queueIdByResolvedName: Map<string, SupportedQueueIds<Queues>>

  private flowProducer?: FlowProducerType
  private startPromise?: Promise<void>

  constructor(
    flowProducerFactory: BullmqFlowProducerFactory<FlowProducerType, FlowProducerOptionsType>,
    queueManager: QueueManager<Queues, QueueType, QueueOptionsType, JobOptionsType>,
    config: FlowManagerConfig = {},
  ) {
    this.queueManager = queueManager
    this.flowProducerFactory = flowProducerFactory
    this.config = config

    this.queueIdByResolvedName = new Map()
    for (const queueId of queueManager.queueRegistry.queueIds) {
      const typedQueueId = queueId as SupportedQueueIds<Queues>
      const queueConfig = queueManager.queueRegistry.getQueueConfig(typedQueueId)
      this.queueIdByResolvedName.set(resolveQueueId(queueConfig), typedQueueId)
    }
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

  /**
   * Returns the shared spy for `queueId` — the very same instance
   * `QueueManager.getSpy` and a processor's spy expose, so tests see a unified
   * view of every job whether it was scheduled directly or as part of a flow.
   */
  public getSpy<QueueId extends SupportedQueueIds<Queues>, JobReturn = unknown>(
    queueId: QueueId,
  ): BackgroundJobProcessorSpyInterface<JobPayloadForQueue<Queues, QueueId>, JobReturn> {
    return this.queueManager.getSpy<QueueId, JobReturn>(queueId)
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
    const queueName = resolveQueueId(this.queueManager.queueRegistry.getQueueConfig(queueId))

    await this.startIfNotStarted()
    return this.getFlowProducer().getFlow({ ...rest, queueName })
  }

  private async doStart(): Promise<void> {
    const redisConfig = this.queueManager.config.redisConfig
    const options = {
      connection: sanitizeRedisConfig(enrichRedisConfig(redisConfig)),
      prefix: redisConfig.keyPrefix ?? undefined,
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
    const queueConfig = this.queueManager.queueRegistry.getQueueConfig(queueId)
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
    const queueConfig = this.queueManager.queueRegistry.getQueueConfig(queueId)
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
    const queueConfig = this.queueManager.queueRegistry.getQueueConfig(queueId)

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

    return prepareJobOptions(this.queueManager.config.isTest, resolvedOptions)
  }

  private resolveChildJobOptions<QueueId extends SupportedQueueIds<Queues>>(
    queueId: QueueId,
    jobPayload: JobPayloadForQueue<Queues, QueueId>,
    options?: FlowChildJobOptions,
  ): FlowChildJobOptions {
    const queueConfig = this.queueManager.queueRegistry.getQueueConfig(queueId)

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
    return prepareJobOptions(this.queueManager.config.isTest, resolvedOptions)
  }

  private recordNode(node: JobNode): void {
    if (this.queueManager.config.isTest) {
      const job = node.job
      if (job?.id) {
        const queueId = this.queueIdByResolvedName.get(job.queueName)
        if (queueId) this.queueManager.recordScheduledJob(queueId, job)
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
