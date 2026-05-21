import type { JobsOptions, QueueOptions } from 'bullmq'
import { commonBullDashboardGroupingBuilder } from '../public-utils/index.ts'
import type { ModuleAwareQueueConfiguration } from './ModuleAwareQueueManager.ts'

/**
 * Apply Lokalise's `[serviceId, moduleId]` dashboard grouping to a list of
 * {@link ModuleAwareQueueConfiguration} entries. Mirrors what
 * {@link ModuleAwareQueueManager} does on its inputs.
 *
 * Useful when you need grouped configs without instantiating a `QueueManager` —
 * for example a publish-only service that constructs a standalone
 * {@link QueueConfigRegistry} for {@link FlowManager}.
 */
export const applyModuleGrouping = <
  ModuleId extends string,
  QueueOptionsType extends QueueOptions = QueueOptions,
  JobOptionsType extends JobsOptions = JobsOptions,
  Queues extends ModuleAwareQueueConfiguration<
    ModuleId,
    QueueOptionsType,
    JobOptionsType
  >[] = ModuleAwareQueueConfiguration<ModuleId, QueueOptionsType, JobOptionsType>[],
>(
  serviceId: string,
  queues: Queues,
): Queues =>
  queues.map((queue) => ({
    ...queue,
    bullDashboardGrouping: commonBullDashboardGroupingBuilder(serviceId, queue.moduleId),
  })) as unknown as Queues
