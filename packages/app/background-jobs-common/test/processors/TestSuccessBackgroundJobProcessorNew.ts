import { NoopObservabilityManager } from '@lokalise/node-core'
import type { Job } from 'bullmq'
import type { QueueConfiguration, RequestContext } from '../../src/index.ts'
import {
  AbstractBackgroundJobProcessorNew,
  type BackgroundJobProcessorDependenciesNew,
  CommonBullmqFactoryNew,
  type JobPayloadForQueue,
  type SupportedQueueIds,
} from '../../src/index.ts'

export class TestSuccessBackgroundJobProcessorNew<
  Q extends QueueConfiguration[],
  T extends SupportedQueueIds<Q>,
> extends AbstractBackgroundJobProcessorNew<Q, T, object | undefined> {
  private onSuccessCounter = 0
  private onSuccessCall: (job: Job<JobPayloadForQueue<Q, T>>) => void | Promise<void> = () => {}
  private _jobDataResult!: unknown
  private _returnValue: object | undefined = undefined

  constructor(
    dependencies: Omit<
      BackgroundJobProcessorDependenciesNew<Q, T, object | undefined>,
      'workerFactory' | 'transactionObservabilityManager'
    >,
    queueId: T,
  ) {
    super(
      {
        transactionObservabilityManager: new NoopObservabilityManager(),
        logger: dependencies.logger,
        errorReporter: dependencies.errorReporter,
        queueManager: dependencies.queueManager,
        workerFactory: new CommonBullmqFactoryNew(),
      },
      {
        queueId,
        ownerName: 'testOwner',
        workerOptions: { concurrency: 1 },
      },
    )
  }

  protected override process(): Promise<object | undefined> {
    return Promise.resolve(this._returnValue)
  }

  protected override async onSuccess(
    job: Job<JobPayloadForQueue<Q, T>>,
    requestContext: RequestContext,
  ): Promise<void> {
    this.onSuccessCounter += 1
    await this.onSuccessCall(job)
    this._jobDataResult = job.data
    return super.onSuccess(job, requestContext)
  }

  /** Configures the value returned by `process`, persisted by BullMQ as the job return value. */
  set returnValue(value: object | undefined) {
    this._returnValue = value
  }

  get jobDataResult(): unknown {
    return this._jobDataResult
  }

  set onSuccessHook(hook: (job: Job<JobPayloadForQueue<Q, T>>) => void | Promise<void>) {
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
