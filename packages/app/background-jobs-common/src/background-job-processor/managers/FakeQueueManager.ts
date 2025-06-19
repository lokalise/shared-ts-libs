import { CommonBullmqFactoryNew } from '../factories/CommonBullmqFactoryNew.ts'
import { QueueManager } from './QueueManager.ts'
import type { QueueConfiguration, QueueManagerConfig } from './types.ts'

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
