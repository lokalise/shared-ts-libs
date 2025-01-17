import type {
  CommonLogger,
  ErrorReporter,
  RedisConfig,
  TransactionObservabilityManager,
} from '@lokalise/node-core'
import type { Job, Queue, QueueOptions, Worker, WorkerOptions } from 'bullmq'
import type { BarrierCallback } from '../barrier/barrier'
import type { AbstractBullmqFactory } from '../factories/AbstractBullmqFactory'
import type { BaseJobPayload, BullmqProcessor, SafeJob } from '../types'

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
  workerOptions: Omit<Partial<WorkerOptionsType>, 'connection' | 'prefix'>
  redisConfig: RedisConfig
  barrier?: BarrierCallback<JobPayload, ExecutionContext, JobReturn, JobType>
  lazyInitEnabled?: boolean
}

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
