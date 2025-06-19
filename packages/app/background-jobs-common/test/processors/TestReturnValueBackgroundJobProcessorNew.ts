import {
  AbstractBackgroundJobProcessorNew,
  type BackgroundJobProcessorDependenciesNew,
  type QueueConfiguration,
  type SupportedQueueIds,
} from '../../src/index.ts'

export class TestReturnValueBackgroundJobProcessorNew<
  Q extends QueueConfiguration[],
  T extends SupportedQueueIds<Q>,
  JobReturn = void,
> extends AbstractBackgroundJobProcessorNew<Q, T, JobReturn> {
  private readonly returnValue: JobReturn

  constructor(
    dependencies: BackgroundJobProcessorDependenciesNew<Q, T, JobReturn>,
    queueId: T,
    returnValue: JobReturn,
  ) {
    super(dependencies, {
      queueId,
      ownerName: 'test',
      workerOptions: { concurrency: 1 },
    })
    this.returnValue = returnValue
  }

  protected override process(): Promise<JobReturn> {
    return Promise.resolve(this.returnValue)
  }
}
