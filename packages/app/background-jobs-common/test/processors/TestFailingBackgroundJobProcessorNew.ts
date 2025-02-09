import type { Job } from 'bullmq'

import type { RedisConfig } from '@lokalise/node-core'
import {
  type BackgroundJobProcessorDependenciesNew,
  FakeBackgroundJobProcessorNew,
  type QueueConfiguration,
} from '../../src'
import type { BaseJobPayload, RequestContext } from '../../src'

type TestFailingUpdatedBackgroundJobProcessorData = {
  id?: string
} & BaseJobPayload

export class TestFailingBackgroundJobProcessorNew<
  Q extends QueueConfiguration[],
  T extends TestFailingUpdatedBackgroundJobProcessorData,
> extends FakeBackgroundJobProcessorNew<Q, T> {
  private _errorsOnProcess: Error[] = []
  private _errorsToThrowOnProcess: Error[] = []
  private _errorToThrowOnFailed: Error | undefined

  constructor(
    dependencies: BackgroundJobProcessorDependenciesNew<Q, T>,
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
