import type { Job } from 'bullmq'
import {
  type BaseJobPayload,
  FakeBackgroundJobProcessorNew,
  type SupportedQueueIds,
} from '../../src'
import type { QueueConfiguration, RequestContext } from '../../src'

export class TestSuccessBackgroundJobProcessorNew<
  Q extends QueueConfiguration[],
  T extends SupportedQueueIds<Q>,
> extends FakeBackgroundJobProcessorNew<Q, T> {
  private onSuccessCounter = 0
  private onSuccessCall!: (job: Job<BaseJobPayload>) => void
  private _jobDataResult!: unknown

  protected override process(): Promise<void> {
    return Promise.resolve()
  }

  protected override onSuccess(
    job: Job<BaseJobPayload>,
    requestContext: RequestContext,
  ): Promise<void> {
    this.onSuccessCounter += 1
    this.onSuccessCall(job)
    this._jobDataResult = job.data
    return super.onSuccess(job, requestContext)
  }

  get jobDataResult(): unknown {
    return this._jobDataResult
  }

  override purgeJobData(job: Job<BaseJobPayload>): Promise<void> {
    return super.purgeJobData(job)
  }

  set onSuccessHook(hook: (job: Job<BaseJobPayload>) => void) {
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
