import { CommonBullmqFactoryNew } from '../factories/CommonBullmqFactoryNew.ts'
import { FlowManager, type FlowManagerConfig } from './FlowManager.ts'
import type { QueueConfiguration } from './types.ts'

/**
 * Test-mode {@link FlowManager}: wires up {@link CommonBullmqFactoryNew}, defaults
 * `isTest` and `lazyInitEnabled` to `true` so specs can call `addFlow` without
 * remembering to call `start()` first.
 */
export class FakeFlowManager<Queues extends QueueConfiguration[]> extends FlowManager<Queues> {
  constructor(
    queues: Queues,
    config: Partial<FlowManagerConfig> & Pick<FlowManagerConfig, 'redisConfig'>,
  ) {
    const mergedConfig: FlowManagerConfig = {
      isTest: config?.isTest ?? true,
      lazyInitEnabled: config?.lazyInitEnabled ?? true,
      redisConfig: config.redisConfig,
    }
    super(new CommonBullmqFactoryNew(), queues, mergedConfig)
  }
}
