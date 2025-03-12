import type { Job } from 'bullmq'

import type { RedisConfig } from '@lokalise/node-core'
import {
  type BackgroundJobProcessorDependencies,
  type BaseJobPayload,
  FakeBackgroundJobProcessor,
  type RequestContext,
} from '../../src.js'

type TestFailingBackgroundJobProcessorData = {
  id?: string
} & BaseJobPayload

export class TestFailingBackgroundJobProcessor<
  T extends TestFailingBackgroundJobProcessorData,
> extends FakeBackgroundJobProcessor<T> {
  private _errorsOnProcess: Error[] = []
  private _errorsToThrowOnProcess: Error[] = []
  private _errorToThrowOnFailed: Error | undefined

  constructor(
    dependencies: BackgroundJobProcessorDependencies<T>,
    queueName: string,
    redisConfig: RedisConfig,
  ) {
    super(dependencies, queueName, redisConfig, true)
  }

  protected override async process(job: Job<T>): Promise<void> {
    await super.process(job)
    const attempt = job.attemptsMade
    if (this._errorsToThrowOnProcess.length >= attempt) {
      throw this._errorsToThrowOnProcess[attempt] ?? new Error('Error has happened')
    }
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

  protected override async onFailed(job: Job<T>, error: Error, requestContext: RequestContext) {
    await super.onFailed(job, error, requestContext)
    this._errorsOnProcess.push(error)
    if (this._errorToThrowOnFailed) {
      throw this._errorToThrowOnFailed
    }
  }
}
