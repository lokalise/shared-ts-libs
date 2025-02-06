import { type QueueConfiguration, QueueManager, type QueueManagerConfig } from './QueueManager.js'

export class FakeQueueManager<Queues extends QueueConfiguration[]> extends QueueManager<Queues> {
  constructor(queues: Queues, config?: Partial<QueueManagerConfig>) {
    const mergedConfig: QueueManagerConfig = {
      isTest: config?.isTest ?? true,
      lazyInitEnabled: config?.lazyInitEnabled ?? false,
    }
    super(queues, mergedConfig)
  }
}
