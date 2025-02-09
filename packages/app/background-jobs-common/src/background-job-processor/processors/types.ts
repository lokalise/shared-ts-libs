import type {
  CommonLogger,
  ErrorReporter,
  RedisConfig,
  TransactionObservabilityManager,
} from '@lokalise/node-core'
import type { Job, JobsOptions, Queue, QueueOptions, Worker, WorkerOptions } from 'bullmq'
import type { BarrierCallback } from '../barrier/barrier'
import type { AbstractBullmqFactory } from '../factories/AbstractBullmqFactory'
import type { QueueManager } from '../managers/QueueManager'
import type { JobPayloadForQueue, QueueConfiguration, SupportedQueueIds } from '../managers/types'
import type { BaseJobPayload, BullmqProcessor, SafeJob } from '../types'

export type BackgroundJobProcessorConfigNew<
  Queues extends QueueConfiguration[],
  QueueId extends SupportedQueueIds<Queues>,
  WorkerOptionsType extends WorkerOptions = WorkerOptions,
  JobPayload extends BaseJobPayload = BaseJobPayload,
  ExecutionContext = void,
  JobReturn = void,
  JobType extends SafeJob<JobPayload, JobReturn> = Job<JobPayload, JobReturn>,
> = {
  queueId: QueueId
  isTest: boolean
  // Name of a webservice or a module running the bg job. Used for logging/observability
  ownerName: string
  workerOptions: Omit<Partial<WorkerOptionsType>, 'connection' | 'prefix' | 'autorun'>
  redisConfig: RedisConfig
  barrier?: BarrierCallback<JobPayload, ExecutionContext, JobReturn, JobType>
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
  queueOptions?: Omit<Partial<QueueOptionsType>, 'connection' | 'prefix'>
  workerOptions: Omit<Partial<WorkerOptionsType>, 'connection' | 'prefix' | 'autorun'>
  redisConfig: RedisConfig
  barrier?: BarrierCallback<JobPayload, ExecutionContext, JobReturn, JobType>
  lazyInitEnabled?: boolean
  workerAutoRunEnabled?: boolean
}

export type BackgroundJobProcessorDependenciesNew<
  Queues extends QueueConfiguration<QueueOptionsType, JobOptionsType>[],
  QueueId extends SupportedQueueIds<Queues>,
  JobPayload extends BaseJobPayload = JobPayloadForQueue<Queues, QueueId>,
  JobReturn = void,
  JobType extends SafeJob<JobPayload, JobReturn> = Job<JobPayload, JobReturn>,
  JobOptionsType extends JobsOptions = JobsOptions,
  QueueType extends Queue<JobPayload, JobReturn, string, JobPayload, JobReturn, string> = Queue<
    JobPayload,
    JobReturn,
    string,
    JobPayload,
    JobReturn,
    string
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
  queueManager: QueueManager<Queues, JobOptionsType, QueueType, QueueOptionsType>
  bullmqFactory: AbstractBullmqFactory<
    Queue,
    QueueOptions,
    WorkerType,
    WorkerOptionsType,
    ProcessorType,
    JobType,
    JobPayload,
    JobReturn
  >
}

/** @deprecated */
export type BackgroundJobProcessorDependencies<
  JobPayload extends object,
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

export type JobsPaginatedResponse<JobData extends object, jobReturn> = {
  jobs: JobInQueue<JobData, jobReturn>[]
  hasMore: boolean
}
