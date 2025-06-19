import { DelayedError, type Job } from 'bullmq'

import { generateMonotonicUuid } from '@lokalise/id-utils'
import type { RedisConfig } from '@lokalise/node-core'
import {
  AbstractBackgroundJobProcessor,
  type BackgroundJobProcessorDependencies,
  type BaseJobPayload,
} from '../../src/index.ts'

type Data = {
  id?: string
} & BaseJobPayload

type OnFailedError = {
  error: Error
  job: Job<Data>
}

export class TestForeverRescheduledBackgroundJobProcessor extends AbstractBackgroundJobProcessor<Data> {
  private _onFailedErrors: OnFailedError[] = []

  constructor(dependencies: BackgroundJobProcessorDependencies<Data>, redisConfig: RedisConfig) {
    super(dependencies, {
      queueId: generateMonotonicUuid(),
      ownerName: 'test',
      isTest: true,
      workerOptions: { concurrency: 1 },
      redisConfig: redisConfig,
    })
  }

  override schedule(jobData: Data): Promise<string> {
    return super.schedule(jobData, {
      attempts: 1,
      backoff: { type: 'fixed', delay: 1 },
      removeOnComplete: true,
      removeOnFail: 1, // we should keep the job in the queue to test the stalled job behavior
    })
  }

  protected override async process(job: Job<Data>): Promise<void> {
    const nextTryTimestamp = Date.now() + 6000
    await job.moveToDelayed(nextTryTimestamp, job.token)
    throw new DelayedError()
  }

  protected override onFailed(job: Job<Data>, error: Error): Promise<void> {
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
