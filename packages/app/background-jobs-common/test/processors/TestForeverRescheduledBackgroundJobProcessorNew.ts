import { generateMonotonicUuid } from '@lokalise/id-utils'
import type { RedisConfig } from '@lokalise/node-core'
import { DelayedError, type Job } from 'bullmq'
import {
  AbstractBackgroundJobProcessor, AbstractBackgroundJobProcessorNew,
  type BackgroundJobProcessorDependencies, type BackgroundJobProcessorDependenciesNew,
  type BaseJobPayload, type QueueConfiguration, type SupportedQueueIds,
} from '../../src/index.ts'

type Data = {
  id?: string
} & BaseJobPayload

type OnFailedError = {
  error: Error
  job: Job<Data>
}

export class TestForeverRescheduledBackgroundJobProcessor<Q extends QueueConfiguration[]> extends AbstractBackgroundJobProcessorNew<Q, 'TestForeverRescheduledBackgroundJobProcessor'> {
  private _onFailedErrors: OnFailedError[] = []

  constructor(dependencies: BackgroundJobProcessorDependenciesNew<Q, 'TestForeverRescheduledBackgroundJobProcessor'>, redisConfig: RedisConfig) {
    super(dependencies, {
      queueId: 'TestForeverRescheduledBackgroundJobProcessor',
      ownerName: 'test',
      isTest: true,
      workerOptions: { concurrency: 1 },
      redisConfig: redisConfig,
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
