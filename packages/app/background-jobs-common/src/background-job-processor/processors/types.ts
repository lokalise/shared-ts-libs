import type {
  CommonLogger,
  ErrorReporter,
  RedisConfig,
  TransactionObservabilityManager,
} from '@lokalise/node-core'
import type { Job, JobsOptions, Queue, QueueOptions, Worker, WorkerOptions } from 'bullmq'
import type { AbstractBullmqFactory } from '../factories/AbstractBullmqFactory'
import type { BullmqProcessor, SafeJob, SafeQueue } from '../types'

export type BackgroundJobProcessorConfig<
  QueueOptionsType extends QueueOptions = QueueOptions,
  WorkerOptionsType extends WorkerOptions = WorkerOptions,
> = {
  queueId: string
  isTest: boolean
  // Name of a webservice or a module running the bg job. Used for logging/observability
  ownerName: string
  queueOptions?: Partial<QueueOptionsType>
  workerOptions: Partial<WorkerOptionsType>
  redisConfig: RedisConfig
}

export type BackgroundJobProcessorDependencies<
  JobPayload extends object,
  JobReturn = void,
  JobType extends SafeJob<JobPayload, JobReturn> = Job<JobPayload, JobReturn>,
  JobsOptionsType extends JobsOptions = JobsOptions,
  QueueType extends SafeQueue<JobsOptionsType, JobPayload, JobReturn> = Queue<
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
    JobReturn,
    JobsOptionsType
  >
}

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
