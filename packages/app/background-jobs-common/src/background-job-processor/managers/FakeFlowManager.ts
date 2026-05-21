import { CommonBullmqFactoryNew } from '../factories/CommonBullmqFactoryNew.ts'
import { FlowManager, type FlowManagerConfig } from './FlowManager.ts'
import { QueueConfigRegistry } from './QueueRegistry.ts'
import type { QueueConfiguration } from './types.ts'

/**
 * Test-mode {@link FlowManager}: wires up {@link CommonBullmqFactoryNew} and a
 * {@link QueueConfigRegistry} built from `queues`, defaults `isTest` and
 * `lazyInitEnabled` to `true` so specs can call `addFlow` without remembering
 * to call `start()` first.
 *
 * For interop with a real `QueueManager`, share its `queueRegistry` directly
 * via the base {@link FlowManager} constructor instead of using this helper.
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
    super(new CommonBullmqFactoryNew(), new QueueConfigRegistry(queues), mergedConfig)
  }
}
