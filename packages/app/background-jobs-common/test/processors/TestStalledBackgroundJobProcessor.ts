import type { Job } from 'bullmq'

import type { RedisConfig } from '@lokalise/node-core'
import {
  AbstractBackgroundJobProcessor,
  type BackgroundJobProcessorDependencies,
  type BaseJobPayload,
} from '../../src'

type OnFailedError<T> = {
  error: Error
  job: Job<T>
}

export class TestStalledBackgroundJobProcessor<
  T extends BaseJobPayload,
> extends AbstractBackgroundJobProcessor<T> {
  private _onFailedErrors: OnFailedError<T>[] = []

  constructor(dependencies: BackgroundJobProcessorDependencies<T>, redisConfig: RedisConfig) {
    super(dependencies, {
      queueId: 'TestStalledBackgroundJobProcessor queue',
      ownerName: 'test',
      isTest: false, // We don't want to override job options for this processor
      workerOptions: {
        lockDuration: 1,
        stalledInterval: 1,
      },
      redisConfig: redisConfig,
    })
  }

  schedule(jobData: T): Promise<string> {
    return super.schedule(jobData, {
      attempts: 1,
      backoff: { type: 'fixed', delay: 1 },
      removeOnComplete: true,
      removeOnFail: 1, // we should keep the job in the queue to test the stalled job behavior
    })
  }

  protected override process(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 1000))
  }

  protected override onFailed(job: Job<T>, error: Error): Promise<void> {
    this._onFailedErrors.push({ job, error })
    return Promise.resolve()
  }

  get onFailedErrors(): OnFailedError<T>[] {
    return this._onFailedErrors
  }

  clean(): void {
    this._onFailedErrors = []
  }
}
