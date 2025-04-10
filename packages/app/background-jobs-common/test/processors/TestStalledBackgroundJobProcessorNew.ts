import { setTimeout } from 'node:timers/promises'
import type { Job } from 'bullmq'
import {
  AbstractBackgroundJobProcessorNew,
  type BackgroundJobProcessorDependenciesNew,
  type SupportedQueueIds,
} from '../../src/index.js'
import type { QueueConfiguration } from '../../src/index.js'

type OnFailedError = {
  error: Error
  job: Job<unknown>
}

export class TestStalledBackgroundJobProcessorNew<
  Q extends QueueConfiguration[],
  T extends SupportedQueueIds<Q>,
> extends AbstractBackgroundJobProcessorNew<Q, T> {
  private _onFailedErrors: OnFailedError[] = []

  constructor(dependencies: BackgroundJobProcessorDependenciesNew<Q, T>, queueId: T) {
    super(dependencies, {
      queueId,
      ownerName: 'test',
      workerOptions: {
        lockDuration: 10,
        stalledInterval: 1,
        skipLockRenewal: true,
        maxStalledCount: 0,
      },
    })
  }

  protected override async process(): Promise<void> {
    await setTimeout(1000)
  }

  protected override onFailed(job: Job<unknown>, error: Error): Promise<void> {
    this._onFailedErrors.push({ job, error })
    return Promise.resolve()
  }

  get onFailedErrors(): OnFailedError[] {
    return this._onFailedErrors
  }

  clean(): void {
    this._onFailedErrors = []
  }
}
