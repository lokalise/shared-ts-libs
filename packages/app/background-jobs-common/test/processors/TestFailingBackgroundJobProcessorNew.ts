import type { Job } from 'bullmq'
import {
  type BaseJobPayload,
  FakeBackgroundJobProcessorNew,
  type QueueConfiguration,
  type SupportedQueueIds,
} from '../../src'
import type { RequestContext } from '../../src'

export class TestFailingBackgroundJobProcessorNew<
  Q extends QueueConfiguration[],
  T extends SupportedQueueIds<Q>,
> extends FakeBackgroundJobProcessorNew<Q, T> {
  private _errorsOnProcess: Error[] = []
  private _errorsToThrowOnProcess: Error[] = []
  private _errorToThrowOnFailed: Error | undefined

  protected override async process(job: Job<unknown>): Promise<void> {
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

  protected override async onFailed(
    job: Job<BaseJobPayload>,
    error: Error,
    requestContext: RequestContext,
  ) {
    await super.onFailed(job, error, requestContext)
    this._errorsOnProcess.push(error)
    if (this._errorToThrowOnFailed) {
      throw this._errorToThrowOnFailed
    }
  }
}
