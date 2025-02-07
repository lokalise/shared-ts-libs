import type { JobsOptions } from 'bullmq'
import type { z } from 'zod'
import type { BaseJobPayload } from '../types'
import type { JobDefinition, SupportedQueues } from './types'

export class JobRegistry<SupportedJobs extends JobDefinition[]> {
  public readonly supportedJobs: SupportedJobs
  public readonly supportedJobQueues: Set<string>
  private readonly supportedJobMap: Record<string, JobDefinition> = {}

  constructor(supportedJobs: SupportedJobs) {
    this.supportedJobs = supportedJobs
    this.supportedJobQueues = new Set<string>()

    for (const supportedJob of supportedJobs) {
      this.supportedJobMap[supportedJob.queueId] = supportedJob
      this.supportedJobQueues.add(supportedJob.queueId)
    }
  }

  public getJobPayloadSchemaByQueue = <JobPayload extends BaseJobPayload = BaseJobPayload>(
    queueId: SupportedQueues<SupportedJobs>,
  ): z.ZodSchema<JobPayload> => {
    return this.supportedJobMap[queueId].jobPayloadSchema
  }

  public getJobOptions = (queueId: SupportedQueues<SupportedJobs>): JobsOptions | undefined => {
    return this.supportedJobMap[queueId].options
  }

  public isSupportedQueue(queueId: string) {
    return this.supportedJobQueues.has(queueId)
  }
}
