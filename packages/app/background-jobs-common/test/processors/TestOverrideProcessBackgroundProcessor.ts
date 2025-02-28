import type { Job } from 'bullmq'
import {
  AbstractBackgroundJobProcessorNew,
  type BackgroundJobProcessorDependenciesNew,
  type JobPayloadForQueue,
  type QueueConfiguration,
  type SupportedQueueIds,
} from '../../src'

type ProcessOverride<Q extends QueueConfiguration[], T extends SupportedQueueIds<Q>> = (
  job: Job<JobPayloadForQueue<Q, T>>,
) => void

export class TestOverrideProcessBackgroundProcessor<
  Q extends QueueConfiguration[],
  T extends SupportedQueueIds<Q>,
> extends AbstractBackgroundJobProcessorNew<Q, T> {
  private _processOverride?: ProcessOverride<Q, T>

  constructor(dependencies: BackgroundJobProcessorDependenciesNew<Q, T>, queueId: T) {
    super(dependencies, {
      queueId,
      ownerName: 'test',
      workerOptions: { concurrency: 1 },
    })
  }

  set processOverride(processOverride: ProcessOverride<Q, T>) {
    this._processOverride = processOverride
  }

  protected process(job: Job<JobPayloadForQueue<Q, T>>): Promise<void> {
    if (this._processOverride) this._processOverride(job)
    return Promise.resolve(undefined)
  }
}
