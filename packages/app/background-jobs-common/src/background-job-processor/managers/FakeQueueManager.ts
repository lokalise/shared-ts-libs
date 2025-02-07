import type { JobRegistry } from './JobRegistry'
import { QueueManager } from './QueueManager'
import type { JobDefinition, QueueConfiguration, QueueManagerConfig } from './types'

export class FakeQueueManager<
  SupportedJobs extends JobDefinition[],
> extends QueueManager<SupportedJobs> {
  constructor(
    queues: QueueConfiguration[],
    jobRegistry: JobRegistry<SupportedJobs>,
    config?: Partial<QueueManagerConfig>,
  ) {
    const mergedConfig: QueueManagerConfig = {
      isTest: config?.isTest ?? true,
      lazyInitEnabled: config?.lazyInitEnabled ?? false,
    }
    super(queues, jobRegistry, mergedConfig)
  }
}
