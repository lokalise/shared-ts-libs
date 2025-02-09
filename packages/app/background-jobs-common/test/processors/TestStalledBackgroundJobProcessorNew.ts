import type { Job } from 'bullmq'

import type { RedisConfig } from '@lokalise/node-core'
import {
  AbstractBackgroundJobProcessorNew,
  type BackgroundJobProcessorDependenciesNew,
} from '../../src'
import type { BaseJobPayload, QueueConfiguration } from '../../src'

type OnFailedError<T> = {
  error: Error
  job: Job<T>
}

export class TestStalledBackgroundJobProcessorNew<
  Q extends QueueConfiguration[],
  T extends BaseJobPayload,
> extends AbstractBackgroundJobProcessorNew<Q, T> {
  private _onFailedErrors: OnFailedError<T>[] = []

  constructor(
    dependencies: BackgroundJobProcessorDependenciesNew<Q, T>,
    queueId: string,
    redisConfig: RedisConfig,
  ) {
    super(dependencies, {
      queueId,
      ownerName: 'test',
      isTest: false, // We don't want to override job options for this processor
      workerOptions: {
        lockDuration: 1,
        stalledInterval: 1,
      },
      redisConfig: redisConfig,
    })
  }

  protected override process(): Promise<void> {
    console.info('Processing')
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
