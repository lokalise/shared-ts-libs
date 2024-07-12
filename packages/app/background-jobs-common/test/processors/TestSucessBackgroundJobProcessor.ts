import type { Job } from 'bullmq'

import {
  type BackgroundJobProcessorDependencies,
  type BaseJobPayload,
  FakeBackgroundJobProcessor,
  type RequestContext,
} from '../../src'

type TestSuccessBackgroundJobProcessorData = {
  id?: string
} & BaseJobPayload

export class TestSuccessBackgroundJobProcessor<
  T extends TestSuccessBackgroundJobProcessorData,
> extends FakeBackgroundJobProcessor<T> {
  private onSuccessCounter = 0
  private onSuccessCall!: (job: Job<T>) => void
  private _jobDataResult!: TestSuccessBackgroundJobProcessorData

  constructor(
    dependencies: BackgroundJobProcessorDependencies<T>,
    queueName: string,
    isTest = true,
  ) {
    super(dependencies, queueName, isTest)
  }

  schedule(jobData: T): Promise<string> {
    return super.schedule(jobData, { attempts: 1, removeOnComplete: false })
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

  get jobDataResult(): TestSuccessBackgroundJobProcessorData {
    return this._jobDataResult
  }

  set onSuccessHook(hook: (job: Job<T>) => void) {
    this.onSuccessCall = hook
  }

  get onSuccessCallsCounter(): number {
    return this.onSuccessCounter
  }
}
