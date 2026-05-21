import type { FlowProducer, QueueBaseOptions } from 'bullmq'

export interface BullmqFlowProducerFactory<
  FlowProducerType extends FlowProducer = FlowProducer,
  FlowProducerOptionsType extends QueueBaseOptions = QueueBaseOptions,
> {
  buildFlowProducer(options: FlowProducerOptionsType): FlowProducerType
}
