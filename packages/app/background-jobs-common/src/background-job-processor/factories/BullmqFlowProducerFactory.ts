import type { FlowProducer, QueueBaseOptions } from 'bullmq'

/**
 * Builds a BullMQ {@link FlowProducer}. The companion of `BullmqQueueFactory`
 * for flows: implementations receive the connection/prefix options resolved by
 * `FlowManager` and must return a producer that can be `waitUntilReady`'d.
 */
export interface BullmqFlowProducerFactory<
  FlowProducerType extends FlowProducer = FlowProducer,
  FlowProducerOptionsType extends QueueBaseOptions = QueueBaseOptions,
> {
  buildFlowProducer(options: FlowProducerOptionsType): FlowProducerType
}
