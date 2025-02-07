import type { Job } from 'bullmq'

import type { RedisConfig } from '@lokalise/node-core'
import { AbstractBackgroundJobProcessorNew } from '../../src/background-job-processor/processors/AbstractBackgroundJobProcessorNew'
import type { BackgroundJobProcessorDependencies, BaseJobPayload } from '../../src/index.js'

type OnFailedError<T> = {
  error: Error
  job: Job<T>
}

export class TestStalledUpdatedBackgroundJobProcessor<
  T extends BaseJobPayload,
> extends AbstractBackgroundJobProcessorNew<T> {
  private _onFailedErrors: OnFailedError<T>[] = []

  constructor(
    dependencies: BackgroundJobProcessorDependencies<T>,
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
