import type { JobsOptions, Queue, QueueOptions } from 'bullmq'
import type { BullmqQueueFactory } from '../factories/index.ts'
import { applyModuleGrouping } from './applyModuleGrouping.ts'
import { QueueManager } from './QueueManager.ts'
import type { QueueConfiguration, QueueManagerConfig, SupportedJobPayloads } from './types.ts'

export type ModuleAwareQueueConfiguration<
  ModuleId extends string = string,
  QueueOptionsType extends QueueOptions = QueueOptions,
  JobOptionsType extends JobsOptions = JobsOptions,
> = Omit<QueueConfiguration<QueueOptionsType, JobOptionsType>, 'bullDashboardGrouping'> & {
  moduleId: ModuleId
}

/**
 * Lokalise-specific queue manager that automatically handles bull dashboard grouping.
 *
 * - Automatically builds dashboard grouping as [serviceId, moduleId]
 * - Enables lazy initialization in production (disabled in tests)
 */
export class ModuleAwareQueueManager<
  Queues extends ModuleAwareQueueConfiguration<ModuleId, QueueOptionsType, JobOptionsType>[],
  ModuleId extends string = string,
  QueueType extends Queue<
    SupportedJobPayloads<Queues>,
    unknown,
    string,
    SupportedJobPayloads<Queues>,
    unknown,
    string
  > = Queue<SupportedJobPayloads<Queues>, void, string, SupportedJobPayloads<Queues>, void, string>,
  QueueOptionsType extends QueueOptions = QueueOptions,
  JobOptionsType extends JobsOptions = JobsOptions,
> extends QueueManager<Queues, QueueType, QueueOptionsType, JobOptionsType> {
  constructor(
    serviceId: string,
    queueFactory: BullmqQueueFactory<QueueType, QueueOptionsType>,
    queues: Queues,
    config: Omit<QueueManagerConfig, 'lazyInitEnabled'>,
  ) {
    super(queueFactory, applyModuleGrouping(serviceId, queues), {
      isTest: config.isTest,
      redisConfig: config.redisConfig,
      lazyInitEnabled: !config.isTest,
    })
  }
}
