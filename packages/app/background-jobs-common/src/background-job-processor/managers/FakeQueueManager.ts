import { CommonBullmqFactoryNew } from '../factories/CommonBullmqFactoryNew.js'
import { QueueManager } from './QueueManager.js'
import type { QueueConfiguration, QueueManagerConfig } from './types.js'

export class FakeQueueManager<Queues extends QueueConfiguration[]> extends QueueManager<Queues> {
  constructor(
    queues: Queues,
    config: Partial<QueueManagerConfig> & Pick<QueueManagerConfig, 'redisConfig'>,
  ) {
    const mergedConfig: QueueManagerConfig = {
      isTest: config?.isTest ?? true,
      lazyInitEnabled: config?.lazyInitEnabled ?? false,
      redisConfig: config.redisConfig,
    }
    super(new CommonBullmqFactoryNew(), queues, mergedConfig)
  }
}
