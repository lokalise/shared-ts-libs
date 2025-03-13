import type {
  CommonLogger,
  ErrorReporter,
  RedisConfig,
  TransactionObservabilityManager,
} from '@lokalise/node-core'
import type { Job, JobsOptions, Queue, QueueOptions, Worker, WorkerOptions } from 'bullmq'
import type { BarrierCallback } from '../barrier/barrier.js'
import type { AbstractBullmqFactory } from '../factories/AbstractBullmqFactory.js'
import type { BullmqWorkerFactory } from '../factories/BullmqWorkerFactory.js'
import type { QueueManager } from '../managers/QueueManager.js'
import type {
  JobPayloadForQueue,
  QueueConfiguration,
  SupportedJobPayloads,
  SupportedQueueIds,
} from '../managers/types.js'
import type { BaseJobPayload, BullmqProcessor, SafeJob } from '../types.js'

export type BackgroundJobProcessorConfigNew<
  Queues extends QueueConfiguration[],
  QueueId extends SupportedQueueIds<Queues>,
  WorkerOptionsType extends WorkerOptions = WorkerOptions,
  ExecutionContext = void,
  JobReturn = void,
  JobType extends SafeJob<JobPayloadForQueue<Queues, QueueId>, JobReturn> = Job<
    JobPayloadForQueue<Queues, QueueId>,
    JobReturn
  >,
> = {
  queueId: QueueId
  // Name of a webservice or a module running the bg job. Used for logging/observability
  ownerName: string
  workerOptions: Omit<Partial<WorkerOptionsType>, 'connection' | 'prefix' | 'autorun'>
  barrier?: BarrierCallback<
    JobPayloadForQueue<Queues, QueueId>,
    ExecutionContext,
    JobReturn,
    JobType
  >
}

/** @deprecated */
export type BackgroundJobProcessorConfig<
  QueueOptionsType extends QueueOptions = QueueOptions,
  WorkerOptionsType extends WorkerOptions = WorkerOptions,
  JobPayload extends BaseJobPayload = BaseJobPayload,
  ExecutionContext = void,
  JobReturn = void,
  JobType extends SafeJob<JobPayload, JobReturn> = Job<JobPayload, JobReturn>,
> = {
  queueId: string
  isTest: boolean
  // Name of a webservice or a module running the bg job. Used for logging/observability
  ownerName: string
  queueOptions?: Omit<QueueOptionsType, 'connection' | 'prefix'>
  workerOptions: Omit<WorkerOptionsType, 'connection' | 'prefix' | 'autorun'>
  redisConfig: RedisConfig
  barrier?: BarrierCallback<JobPayload, ExecutionContext, JobReturn, JobType>
  lazyInitEnabled?: boolean
  workerAutoRunEnabled?: boolean
}

export type BackgroundJobProcessorDependenciesNew<
  Queues extends QueueConfiguration<QueueOptionsType, JobOptionsType>[],
  QueueId extends SupportedQueueIds<Queues>,
  JobReturn = void,
  JobType extends SafeJob<JobPayloadForQueue<Queues, QueueId>, JobReturn> = Job<
    JobPayloadForQueue<Queues, QueueId>,
    JobReturn
  >,
  JobOptionsType extends JobsOptions = JobsOptions,
  QueueType extends Queue<
    SupportedJobPayloads<Queues>,
    JobReturn,
    string,
    SupportedJobPayloads<Queues>,
    JobReturn,
    string
  > = Queue<
    SupportedJobPayloads<Queues>,
    JobReturn,
    string,
    SupportedJobPayloads<Queues>,
    JobReturn,
    string
  >,
  QueueOptionsType extends QueueOptions = QueueOptions,
  WorkerType extends Worker<SupportedJobPayloads<Queues>, JobReturn> = Worker<
    SupportedJobPayloads<Queues>,
    JobReturn
  >,
  WorkerOptionsType extends WorkerOptions = WorkerOptions,
  ProcessorType extends BullmqProcessor<
    JobType,
    JobPayloadForQueue<Queues, QueueId>,
    JobReturn
  > = BullmqProcessor<JobType, JobPayloadForQueue<Queues, QueueId>, JobReturn>,
> = {
  transactionObservabilityManager: TransactionObservabilityManager
  logger: CommonLogger
  errorReporter: ErrorReporter
  queueManager: QueueManager<Queues, QueueType, QueueOptionsType, JobOptionsType>
  workerFactory: BullmqWorkerFactory<WorkerType, WorkerOptionsType, JobType, ProcessorType>
}

/** @deprecated */
export type BackgroundJobProcessorDependencies<
  JobPayload extends BaseJobPayload,
  JobReturn = void,
  JobType extends SafeJob<JobPayload, JobReturn> = Job<JobPayload, JobReturn>,
  QueueType extends Queue<JobPayload, JobReturn, string, JobPayload, JobReturn, string> = Queue<
    JobPayload,
    JobReturn,
    string,
    JobPayload,
    JobReturn
  >,
  QueueOptionsType extends QueueOptions = QueueOptions,
  WorkerType extends Worker<JobPayload, JobReturn> = Worker<JobPayload, JobReturn>,
  WorkerOptionsType extends WorkerOptions = WorkerOptions,
  ProcessorType extends BullmqProcessor<JobType, JobPayload, JobReturn> = BullmqProcessor<
    JobType,
    JobPayload,
    JobReturn
  >,
> = {
  transactionObservabilityManager: TransactionObservabilityManager
  logger: CommonLogger
  errorReporter: ErrorReporter
  bullmqFactory: AbstractBullmqFactory<
    QueueType,
    QueueOptionsType,
    WorkerType,
    WorkerOptionsType,
    ProcessorType,
    JobType,
    JobPayload,
    JobReturn
  >
}

export type ProtectedQueue<
  JobPayload extends BaseJobPayload,
  JobReturn = void,
  QueueType = Queue<JobPayload, JobReturn>,
> = Omit<QueueType, 'close' | 'disconnect' | 'obliterate' | 'clean' | 'drain'>

export type ProtectedWorker<
  JobPayload extends BaseJobPayload,
  JobReturn = void,
  WorkerType = Worker<JobPayload, JobReturn>,
> = Omit<WorkerType, 'disconnect' | 'close'>

export type JobInQueue<JobData extends object, jobReturn> = Pick<
  Job<JobData, jobReturn>,
  | 'id'
  | 'data'
  | 'attemptsMade'
  | 'attemptsStarted'
  | 'progress'
  | 'returnvalue'
  | 'failedReason'
  | 'finishedOn'
  | 'getState'
>

export type JobsPaginatedResponse<JobData extends BaseJobPayload, jobReturn> = {
  jobs: JobInQueue<JobData, jobReturn>[]
  hasMore: boolean
}
