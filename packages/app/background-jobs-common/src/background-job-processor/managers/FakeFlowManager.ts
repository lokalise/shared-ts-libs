import { CommonBullmqFactoryNew } from '../factories/CommonBullmqFactoryNew.ts'
import { FlowManager, type FlowManagerConfig } from './FlowManager.ts'
import type { QueueConfiguration } from './types.ts'

export class FakeFlowManager<Queues extends QueueConfiguration[]> extends FlowManager<Queues> {
  constructor(
    queues: Queues,
    config: Partial<FlowManagerConfig> & Pick<FlowManagerConfig, 'redisConfig'>,
  ) {
    const mergedConfig: FlowManagerConfig = {
      isTest: config?.isTest ?? true,
      lazyInitEnabled: config?.lazyInitEnabled ?? false,
      redisConfig: config.redisConfig,
    }
    super(new CommonBullmqFactoryNew(), queues, mergedConfig)
  }
}
