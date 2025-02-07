import type { JobsOptions } from 'bullmq'
import type { z } from 'zod'
import type { BaseJobPayload } from '../types'
import type { JobDefinition, SupportedQueues } from './types'

export class JobRegistry<
  SupportedJobs extends JobDefinition<JobOptionsType>[],
  JobOptionsType extends JobsOptions = JobsOptions,
> {
  public readonly supportedJobs: SupportedJobs
  public readonly supportedJobQueues: Set<string>
  private readonly supportedJobMap: Record<string, JobDefinition<JobOptionsType>> = {}

  constructor(supportedJobs: SupportedJobs) {
    this.supportedJobs = supportedJobs
    this.supportedJobQueues = new Set<string>()

    for (const supportedJob of supportedJobs) {
      this.supportedJobMap[supportedJob.queueId] = supportedJob
      this.supportedJobQueues.add(supportedJob.queueId)
    }
  }

  public getJobPayloadSchemaByQueue<JobPayload extends BaseJobPayload = BaseJobPayload>(
    queueId: SupportedQueues<SupportedJobs>,
  ): z.ZodType<JobPayload> {
    return this.supportedJobMap[queueId].jobPayloadSchema as z.ZodType<JobPayload>
  }

  public getJobOptions = (queueId: SupportedQueues<SupportedJobs>): JobOptionsType | undefined => {
    return this.supportedJobMap[queueId].options
  }

  public isSupportedQueue(queueId: string): boolean {
    return this.supportedJobQueues.has(queueId)
  }
}
