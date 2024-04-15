import { generateMonotonicUuid } from '@lokalise/id-utils'
import type { ErrorReporter } from '@lokalise/node-core'
import { resolveGlobalErrorLogObject } from '@lokalise/node-core'
import { UnrecoverableError } from 'bullmq'
import type { Queue, Worker, WorkerOptions, JobsOptions, Job, QueueOptions } from 'bullmq'
import type Redis from 'ioredis'
import type { BaseLogger, Logger } from 'pino'
import pino from 'pino'
import { merge } from 'ts-deepmerge'

import { BackgroundJobProcessorLogger } from '../BackgroundJobProcessorLogger'
import {
	RETENTION_COMPLETED_JOBS_IN_DAYS,
	RETENTION_FAILED_JOBS_IN_DAYS,
	RETENTION_QUEUE_IDS_IN_DAYS,
} from '../constants'
import type {
	BackgroundJobProcessorConfig,
	BackgroundJobProcessorDependencies,
	BullmqProcessor,
	SafeJob,
	SafeQueue,
	TransactionObservabilityManager,
} from '../types'
import { daysToMilliseconds, daysToSeconds, isStalledJobError, resolveJobId } from '../utils'

import type { AbstractBullmqFactory } from './factories/AbstractBullmqFactory'
import { BackgroundJobProcessorSpy } from './spy/BackgroundJobProcessorSpy'
import type { BackgroundJobProcessorSpyInterface } from './spy/types'

export interface RequestContext {
	logger: BaseLogger
	reqId: string
}

/**
 * Default config
 * 	- Retry config: 3 retries with 30s of total amount of wait time between retries using
 * 			exponential strategy https://docs.bullmq.io/guide/retrying-failing-jobs#built-in-backoff-strategies
 * 	- Job retention: 3 days for completed jobs, 7 days for failed jobs
 */
const DEFAULT_JOB_CONFIG: JobsOptions = {
	attempts: 3,
	backoff: {
		type: 'exponential',
		delay: 5000,
	},
	removeOnComplete: {
		age: daysToSeconds(RETENTION_COMPLETED_JOBS_IN_DAYS),
	},
	removeOnFail: {
		age: daysToSeconds(RETENTION_FAILED_JOBS_IN_DAYS),
	},
}

const QUEUE_IDS_KEY = 'background-jobs-common:background-job:queues'

const queueIdsSet = new Set<string>()

const DEFAULT_WORKER_OPTIONS = {
	concurrency: 10,
	maxStalledCount: 3, // same as default attempts by default
	ttl: 60,
} as const satisfies Omit<WorkerOptions, 'connection'> & { ttl: number }

export abstract class AbstractBackgroundJobProcessor<
	JobPayload extends object,
	JobReturn = void,
	JobType extends SafeJob<JobPayload, JobReturn> = Job,
	QueueType extends SafeQueue<JobOptionsType, JobPayload, JobReturn> = Queue<JobPayload, JobReturn>,
	QueueOptionsType extends QueueOptions = QueueOptions,
	WorkerType extends Worker<JobPayload, JobReturn> = Worker<JobPayload, JobReturn>,
	WorkerOptionsType extends WorkerOptions = WorkerOptions,
	ProcessorType extends BullmqProcessor<JobType, JobPayload, JobReturn> = BullmqProcessor<
		JobType,
		JobPayload,
		JobReturn
	>,
	JobOptionsType extends JobsOptions = JobsOptions,
> {
	protected readonly logger: Logger

	private readonly redis: Redis
	private readonly newRelicBackgroundTransactionManager: TransactionObservabilityManager
	private readonly errorReporter: ErrorReporter
	private readonly config: BackgroundJobProcessorConfig<QueueOptionsType, WorkerOptionsType>

	private queue?: QueueType
	private worker?: WorkerType
	protected _spy?: BackgroundJobProcessorSpy<JobPayload>
	private factory: AbstractBullmqFactory<
		QueueType,
		QueueOptionsType,
		WorkerType,
		WorkerOptionsType,
		ProcessorType,
		JobType,
		JobPayload,
		JobReturn,
		JobOptionsType
	>

	protected constructor(
		dependencies: BackgroundJobProcessorDependencies<
			JobPayload,
			JobReturn,
			JobType,
			JobOptionsType,
			QueueType,
			QueueOptionsType,
			WorkerType,
			WorkerOptionsType,
			ProcessorType
		>,
		config: BackgroundJobProcessorConfig<QueueOptionsType, WorkerOptionsType>,
	) {
		this.config = config
		this.factory = dependencies.bullmqFactory
		this.redis = dependencies.redis
		this.newRelicBackgroundTransactionManager = dependencies.transactionObservabilityManager
		this.logger = dependencies.logger
		this.errorReporter = dependencies.errorReporter
	}

	public static async getActiveQueueIds(redis: Redis): Promise<string[]> {
		await redis.zremrangebyscore(
			QUEUE_IDS_KEY,
			'-inf',
			Date.now() - daysToMilliseconds(RETENTION_QUEUE_IDS_IN_DAYS),
		)
		const queueIds = await redis.zrange(QUEUE_IDS_KEY, 0, -1)
		return queueIds.sort()
	}

	public get spy(): BackgroundJobProcessorSpyInterface<JobPayload> {
		if (!this._spy)
			throw new Error(
				'spy was not instantiated, it is only available on test mode. Please use `config.isTest` to enable it.',
			)

		return this._spy
	}

	public async start(): Promise<void> {
		if (queueIdsSet.has(this.config.queueId))
			throw new Error(`Queue id "${this.config.queueId}" is not unique.`)

		queueIdsSet.add(this.config.queueId)
		await this.redis.zadd(QUEUE_IDS_KEY, Date.now(), this.config.queueId)

		this.queue = this.factory.buildQueue(this.config.queueId, {
			connection: this.redis,
			...this.config.queueOptions,
		} as QueueOptionsType)
		await this.queue.waitUntilReady()

		const mergedWorkerOptions = merge(
			DEFAULT_WORKER_OPTIONS,
			this.config.workerOptions,
		) as unknown as Omit<WorkerOptionsType, 'connection'>
		this.worker = this.factory.buildWorker(
			this.config.queueId,
			(async (job: JobType) => {
				return await this.processInternal(job)
			}) as ProcessorType,
			{
				...mergedWorkerOptions,
				connection: this.redis,
			} as WorkerOptionsType,
		)
		this.worker.on('failed', (job, error) => {
			if (!job) return // Should not be possible with our current config, check 'failed' for more info
			// @ts-expect-error
			this.handleFailedEvent(job, error)
		})

		if (this.config.isTest) {
			// unlike queue, the docs for worker state that this is only useful in tests
			await this.worker.waitUntilReady()
			this._spy = new BackgroundJobProcessorSpy()
		}
	}

	public async dispose(): Promise<void> {
		queueIdsSet.delete(this.config.queueId)

		try {
			// On test forcing the worker to close to not wait for current job to finish
			await this.worker?.close(this.config.isTest)
			await this.queue?.close()
		} catch {
			// do nothing
		}
	}

	public async schedule(jobData: JobPayload, options?: JobOptionsType): Promise<string> {
		const jobIds = await this.scheduleBulk([jobData], options)
		return jobIds[0]
	}

	public async scheduleBulk(jobData: JobPayload[], options?: JobOptionsType): Promise<string[]> {
		const jobs = await this.initializedQueue.addBulk(
			jobData.map((data) => ({
				name: this.constructor.name,
				data,
				opts: this.prepareJobOptions(options ?? ({} as JobOptionsType)),
			})),
		)

		if (!jobs.every((job) => !!job.id)) {
			// Practically unreachable, but we want to simplify the signature of the method and avoid
			// stating that it could return undefined.
			throw new Error('Some scheduled job IDs are undefined')
		}

		return jobs.map((job) => job.id as string)
	}

	private prepareJobOptions(options: JobOptionsType): JobOptionsType {
		const preparedOptions: JobOptionsType = {
			jobId: generateMonotonicUuid(),
			...DEFAULT_JOB_CONFIG,
			...options,
		}

		if (this.config.isTest && typeof preparedOptions.backoff === 'object') {
			preparedOptions.backoff.delay = 1
			preparedOptions.backoff.type = 'fixed'
			preparedOptions.removeOnFail = true
			preparedOptions.removeOnComplete = true
		}

		return preparedOptions
	}

	private async processInternal(job: JobType) {
		const jobId = resolveJobId(job)
		let isSuccess = false
		const requestContext: RequestContext = {
			logger: new BackgroundJobProcessorLogger(this.resolveExecutionLogger(jobId), job),
			reqId: jobId,
		}

		try {
			this.newRelicBackgroundTransactionManager.start(job.name)
			requestContext.logger.info(
				{
					origin: this.constructor.name,
					jobId,
				},
				`Started job ${job.name}`,
			)

			const result = await this.process(job, requestContext)
			isSuccess = true

			this._spy?.addJobProcessingResult(job, 'completed')
			return result
		} finally {
			requestContext.logger.info({ isSuccess, jobId }, `Finished job ${job.name}`)
			this.newRelicBackgroundTransactionManager.stop(job.name)
		}
	}

	private handleFailedEvent(job: JobType, error: Error) {
		const jobId = resolveJobId(job)
		const requestContext: RequestContext = {
			logger: new BackgroundJobProcessorLogger(this.resolveExecutionLogger(jobId), job),
			reqId: jobId,
		}

		requestContext.logger.error(resolveGlobalErrorLogObject(error, jobId))
		this.errorReporter.report({
			error,
			context: {
				id: jobId,
				errorJson: JSON.stringify(pino.stdSerializers.err(error)),
			},
		})

		if (
			error instanceof UnrecoverableError ||
			isStalledJobError(error) ||
			job.opts.attempts === job.attemptsMade
		) {
			void this.internalOnFailed(job, error, requestContext).catch(() => undefined) // nothing to do in case of error
		}
	}

	private async internalOnFailed(
		job: JobType,
		error: Error,
		requestContext: RequestContext,
	): Promise<void> {
		try {
			await this.onFailed(job, error, requestContext)
		} catch (error) {
			requestContext.logger.error(resolveGlobalErrorLogObject(error, job.id))

			if (error instanceof Error) {
				this.errorReporter.report({
					error,
					context: {
						id: job.id,
						errorJson: JSON.stringify(pino.stdSerializers.err(error)),
					},
				})
			}
		}

		this._spy?.addJobProcessingResult(job, 'failed')
	}

	protected resolveExecutionLogger(jobId: string) {
		return this.logger.child({ 'x-request-id': jobId })
	}

	private get initializedQueue(): QueueType {
		if (!this.queue)
			throw new Error(
				`Job queue "${this.config.queueId}" is not initialized. Please call "start" method before scheduling jobs.`,
			)

		return this.queue
	}

	protected abstract process(job: JobType, requestContext: RequestContext): Promise<JobReturn>
	protected abstract onFailed(
		job: JobType,
		error: Error,
		requestContext: RequestContext,
	): Promise<void>
}
