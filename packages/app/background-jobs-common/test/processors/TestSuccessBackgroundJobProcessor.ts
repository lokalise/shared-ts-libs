import type { RedisConfig } from '@lokalise/node-core'
import type { Job } from 'bullmq'
import {
  AbstractBackgroundJobProcessor,
  type BackgroundJobProcessorDependencies,
  type BaseJobPayload,
  CommonBullmqFactory,
  type RequestContext,
} from '../../src/index.ts'

type TestSuccessBackgroundJobProcessorData = {
  id?: string
} & BaseJobPayload
export class TestSuccessBackgroundJobProcessor<
  T extends TestSuccessBackgroundJobProcessorData,
> extends AbstractBackgroundJobProcessor<T> {
  private onSuccessCounter = 0
  private onSuccessCall: (job: Job<T>) => void | Promise<void> = () => {}
  private _jobDataResult!: TestSuccessBackgroundJobProcessorData

  constructor(
    dependencies: Omit<
      BackgroundJobProcessorDependencies<T>,
      'bullmqFactory' | 'transactionObservabilityManager'
    >,
    queueName: string,
    redisConfig: RedisConfig,
    purgeJobDataOnSuccess?: boolean,
  ) {
    super(
      {
        transactionObservabilityManager: {
          /* v8 ignore start */
          start: () => {},
          startWithGroup: () => {},
          stop: () => {},
          addCustomAttributes: () => {},
          /* v8 ignore stop */
        },
        logger: dependencies.logger,
        errorReporter: dependencies.errorReporter,
        bullmqFactory: new CommonBullmqFactory(),
      },
      {
        queueId: queueName,
        ownerName: 'testOwner',
        isTest: true,
        workerOptions: { concurrency: 1 },
        lazyInitEnabled: false,
        redisConfig,
        purgeJobDataOnSuccess,
      },
    )
  }

  override schedule(jobData: T): Promise<string> {
    return super.schedule(jobData, { attempts: 1, removeOnComplete: false })
  }

  protected override process(): Promise<void> {
    return Promise.resolve()
  }

  protected override async onSuccess(job: Job<T>, requestContext: RequestContext): Promise<void> {
    this.onSuccessCounter += 1
    await this.onSuccessCall(job)
    this._jobDataResult = job.data
    return super.onSuccess(job, requestContext)
  }

  get jobDataResult(): TestSuccessBackgroundJobProcessorData {
    return this._jobDataResult
  }

  set onSuccessHook(hook: (job: Job<T>) => void | Promise<void>) {
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
