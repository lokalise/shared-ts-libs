import type { FlowProducer, JobsOptions, QueueBaseOptions, QueueOptions } from 'bullmq'
import type { BullmqFlowProducerFactory } from '../factories/BullmqFlowProducerFactory.ts'
import { commonBullDashboardGroupingBuilder } from '../public-utils/index.ts'
import { FlowManager, type FlowManagerConfig } from './FlowManager.ts'
import type { ModuleAwareQueueConfiguration } from './ModuleAwareQueueManager.ts'

/**
 * Lokalise-specific flow manager that automatically handles bull dashboard
 * grouping the same way {@link ModuleAwareQueueManager} does.
 *
 * - Automatically builds dashboard grouping as [serviceId, moduleId]
 * - Enables lazy initialization in production (disabled in tests)
 */
export class ModuleAwareFlowManager<
  Queues extends ModuleAwareQueueConfiguration<ModuleId, QueueOptionsType, JobOptionsType>[],
  ModuleId extends string = string,
  FlowProducerType extends FlowProducer = FlowProducer,
  FlowProducerOptionsType extends QueueBaseOptions = QueueBaseOptions,
  QueueOptionsType extends QueueOptions = QueueOptions,
  JobOptionsType extends JobsOptions = JobsOptions,
> extends FlowManager<
  Queues,
  FlowProducerType,
  FlowProducerOptionsType,
  QueueOptionsType,
  JobOptionsType
> {
  constructor(
    serviceId: string,
    flowProducerFactory: BullmqFlowProducerFactory<FlowProducerType, FlowProducerOptionsType>,
    queues: Queues,
    config: Omit<FlowManagerConfig, 'lazyInitEnabled'>,
  ) {
    super(flowProducerFactory, ModuleAwareFlowManager.resolveQueuesGrouping(serviceId, queues), {
      isTest: config.isTest,
      redisConfig: config.redisConfig,
      lazyInitEnabled: !config.isTest,
    })
  }

  private static resolveQueuesGrouping<
    ModuleId extends string,
    QueueOptionsType extends QueueOptions,
    JobOptionsType extends JobsOptions,
    Queues extends ModuleAwareQueueConfiguration<ModuleId, QueueOptionsType, JobOptionsType>[],
  >(serviceId: string, queues: Queues): Queues {
    return queues.map((queue) => ({
      ...queue,
      bullDashboardGrouping: commonBullDashboardGroupingBuilder(serviceId, queue.moduleId),
    })) as unknown as Queues
  }
}
