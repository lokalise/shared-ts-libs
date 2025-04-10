import { setTimeout } from 'node:timers/promises'
import type { RedisConfig } from '@lokalise/node-core'
import type { Job } from 'bullmq'
import {
  AbstractBackgroundJobProcessor,
  type BackgroundJobProcessorDependencies,
  type BaseJobPayload,
} from '../../src/index.js'

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
        lockDuration: 10,
        stalledInterval: 1,
        skipLockRenewal: true,
        maxStalledCount: 0,
      },
      redisConfig: redisConfig,
    })
  }

  override schedule(jobData: T): Promise<string> {
    return super.schedule(jobData, {
      attempts: 1,
      backoff: { type: 'fixed', delay: 1 },
      removeOnComplete: true,
      removeOnFail: false,
    })
  }

  protected override async process(): Promise<void> {
    await setTimeout(500)
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
