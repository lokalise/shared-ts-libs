import type { CommonLogger } from '@lokalise/node-core'
import type { Job } from 'bullmq'

import {
  AbstractBackgroundJobProcessor,
  type BackgroundJobProcessorDependencies,
  type BaseJobPayload,
} from '../../src'
import { getTestRedisConfig } from '../setup'

type Data = {
  id?: string
} & BaseJobPayload

type OnFailedError = {
  error: Error
  job: Job<Data>
}

export class TestStalledBackgroundJobProcessor extends AbstractBackgroundJobProcessor<Data> {
  private _onFailedErrors: OnFailedError[] = []
  public lastLogger: CommonLogger | undefined

  constructor(dependencies: BackgroundJobProcessorDependencies<Data>) {
    super(dependencies, {
      queueId: 'TestStalledBackgroundJobProcessor queue',
      ownerName: 'test',
      isTest: false, // We don't want to override job options for this processor
      workerOptions: {
        lockDuration: 1,
        stalledInterval: 1,
      },
      redisConfig: getTestRedisConfig(),
    })
  }

  schedule(jobData: Data): Promise<string> {
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

  protected resolveExecutionLogger(job: Job<Data>): CommonLogger {
    const logger = super.resolveExecutionLogger(job)
    this.lastLogger = logger
    return logger
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
