import type { Job } from 'bullmq'
import type { QueueConfiguration, RequestContext } from '../../src/index.ts'
import {
  FakeBackgroundJobProcessorNew,
  type JobPayloadForQueue,
  type SupportedQueueIds,
} from '../../src/index.ts'

export class TestSuccessBackgroundJobProcessorNew<
  Q extends QueueConfiguration[],
  T extends SupportedQueueIds<Q>,
> extends FakeBackgroundJobProcessorNew<Q, T> {
  private onSuccessCounter = 0
  private onSuccessCall!: (job: Job<JobPayloadForQueue<Q, T>>) => void
  private _jobDataResult!: unknown

  protected override process(): Promise<void> {
    return Promise.resolve()
  }

  protected override onSuccess(
    job: Job<JobPayloadForQueue<Q, T>>,
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

  override purgeJobData(job: Job<JobPayloadForQueue<Q, T>>): Promise<void> {
    return super.purgeJobData(job)
  }

  set onSuccessHook(hook: (job: Job<JobPayloadForQueue<Q, T>>) => void) {
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
