import {
  AbstractQueueManager,
  type QueueConfiguration,
  type QueueManagerConfig,
} from './AbstractQueueManager.js'

export class FakeQueueManager<
  Queues extends QueueConfiguration[],
> extends AbstractQueueManager<Queues> {
  constructor(queues: Queues, config?: Partial<QueueManagerConfig>) {
    const mergedConfig: QueueManagerConfig = {
      isTest: config?.isTest ?? true,
      lazyInitEnabled: config?.lazyInitEnabled ?? false,
    }
    super(queues, mergedConfig)
  }
}
