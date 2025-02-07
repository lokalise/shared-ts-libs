import { type QueueConfiguration, QueueManager, type QueueManagerConfig } from './QueueManager.js'
import type {JobDefinition, JobRegistry} from "./JobRegistry";

export class FakeQueueManager<SupportedJobs extends JobDefinition[]
> extends QueueManager<SupportedJobs> {
  constructor(queues: QueueConfiguration[],
              jobRegistry: JobRegistry<SupportedJobs>,
              config?: Partial<QueueManagerConfig>) {
    const mergedConfig: QueueManagerConfig = {
      isTest: config?.isTest ?? true,
      lazyInitEnabled: config?.lazyInitEnabled ?? false,
    }
    super(queues, jobRegistry, mergedConfig)
  }
}
