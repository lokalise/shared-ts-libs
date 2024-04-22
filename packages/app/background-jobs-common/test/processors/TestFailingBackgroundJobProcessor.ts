import { Job } from 'bullmq'
import { Logger } from 'pino'

import { BackgroundJobProcessorDependencies, FakeBackgroundJobProcessor } from '../../src'

type TestFailingBackgroundJobProcessorData = {
	id?: string
	correlationId: string
}

export class TestFailingBackgroundJobProcessor<
	T extends TestFailingBackgroundJobProcessorData,
> extends FakeBackgroundJobProcessor<T> {
	private _errorsOnProcess: Error[] = []
	private _errorsToThrowOnProcess: Error[] = []
	private _errorToThrowOnFailed: Error | undefined

	public lastLogger: Logger | undefined

	constructor(
		dependencies: BackgroundJobProcessorDependencies<T>,
		queueName: string,
		isTest = true,
	) {
		super(dependencies, queueName, isTest)
	}

	protected override async process(job: Job<T>): Promise<void> {
		await super.process(job)
		const attempt = job.attemptsMade
		if (this._errorsToThrowOnProcess.length >= attempt) {
			throw this._errorsToThrowOnProcess[attempt] ?? new Error('Error has happened')
		}
	}

	protected resolveExecutionLogger(jobId: string): Logger {
		const logger = super.resolveExecutionLogger(jobId)
		this.lastLogger = logger
		return logger
	}

	set errorsToThrowOnProcess(errors: Error[]) {
		this._errorsToThrowOnProcess = errors
	}

	set errorToThrowOnFailed(error: Error | undefined) {
		this._errorToThrowOnFailed = error
	}

	get errorsOnProcess(): Error[] {
		return this._errorsOnProcess
	}

	protected override async onFailed(job: Job<T>, error: Error) {
		await super.onFailed(job, error)
		this._errorsOnProcess.push(error)
		if (this._errorToThrowOnFailed) {
			throw this._errorToThrowOnFailed
		}
	}
}
