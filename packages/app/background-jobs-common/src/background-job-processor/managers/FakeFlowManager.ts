import { CommonBullmqFactoryNew } from '../factories/CommonBullmqFactoryNew.ts'
import { FlowManager } from './FlowManager.ts'
import type { QueueManager } from './QueueManager.ts'
import type { FlowManagerConfig, QueueConfiguration } from './types.ts'

/**
 * Test-mode {@link FlowManager}: wires up {@link CommonBullmqFactoryNew} and
 * defaults `lazyInitEnabled` to `true` so specs can call `addFlow` without
 * remembering to call `start()` first. `isTest`/`redisConfig` are inherited
 * from the paired {@link QueueManager} (typically a `FakeQueueManager`).
 */
export class FakeFlowManager<Queues extends QueueConfiguration[]> extends FlowManager<Queues> {
  constructor(queueManager: QueueManager<Queues>, config: FlowManagerConfig = {}) {
    super(new CommonBullmqFactoryNew(), queueManager, {
      lazyInitEnabled: config.lazyInitEnabled ?? true,
    })
  }
}
