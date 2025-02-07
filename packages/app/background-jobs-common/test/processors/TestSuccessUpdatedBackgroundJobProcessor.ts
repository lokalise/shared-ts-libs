import type { Job } from 'bullmq'

import type { RedisConfig } from '@lokalise/node-core'
import { FakeBackgroundJobProcessorNew } from '../../src/background-job-processor/processors/FakeBackgroundJobProcessorNew.js'
import type {
  BackgroundJobProcessorDependencies,
  BaseJobPayload,
  RequestContext,
} from '../../src/index.js'

type TestSuccessUpdatedBackgroundJobProcessorData = {
  id?: string
} & BaseJobPayload

export class TestSuccessUpdatedBackgroundJobProcessor<
  T extends TestSuccessUpdatedBackgroundJobProcessorData,
> extends FakeBackgroundJobProcessorNew<T> {
  private onSuccessCounter = 0
  private onSuccessCall!: (job: Job<T>) => void
  private _jobDataResult!: TestSuccessUpdatedBackgroundJobProcessorData

  constructor(
    dependencies: BackgroundJobProcessorDependencies<T>,
    queueName: string,
    redisConfig: RedisConfig,
  ) {
    super(dependencies, queueName, redisConfig, true)
  }

  protected override process(): Promise<void> {
    return Promise.resolve()
  }

  protected override onSuccess(job: Job<T>, requestContext: RequestContext): Promise<void> {
    this.onSuccessCounter += 1
    this.onSuccessCall(job)
    this._jobDataResult = job.data
    return super.onSuccess(job, requestContext)
  }

  get jobDataResult(): TestSuccessUpdatedBackgroundJobProcessorData {
    return this._jobDataResult
  }

  override purgeJobData(job: Job<T>): Promise<void> {
    return super.purgeJobData(job)
  }

  set onSuccessHook(hook: (job: Job<T>) => void) {
    this.onSuccessCall = hook
  }

  get onSuccessCallsCounter(): number {
    return this.onSuccessCounter
  }

  get runningPromisesSet(): Set<Promise<unknown>> {
    // @ts-expect-error
    return this.runningPromises
  }
}
