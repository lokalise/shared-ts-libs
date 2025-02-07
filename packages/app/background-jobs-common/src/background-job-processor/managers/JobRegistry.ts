import type { ZodSchema, z } from 'zod'
import type { BaseJobPayload } from '../types'

export type JobDefinition = {
  queueId: string
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  jobPayloadSchema: z.ZodObject<any>
}

// Helper type to extract the inferred type from a Zod schema while preserving optionality
export type InferExact<T extends z.ZodTypeAny> = T extends z.ZodObject<infer Shape>
  ? { [K in keyof Shape]: Shape[K] extends z.ZodTypeAny ? z.infer<Shape[K]> : never }
  : never

export class JobRegistry<SupportedJobs extends JobDefinition[]> {
  public readonly supportedJobs: SupportedJobs
  public readonly supportedJobQueues: Set<string>
  private readonly supportedJobMap: Record<SupportedJobs[number]['queueId'], JobDefinition> =
    {} as Record<string, JobDefinition>

  constructor(supportedJobs: SupportedJobs) {
    this.supportedJobs = supportedJobs
    this.supportedJobQueues = new Set<string>()

    for (const supportedJob of supportedJobs) {
      this.supportedJobMap[supportedJob.queueId as SupportedJobs[number]['queueId']] = supportedJob
      this.supportedJobQueues.add(supportedJob.queueId as SupportedJobs[number]['queueId'])
    }
  }

  public getJobPayloadSchemaByQueue = <JobPayload extends BaseJobPayload = BaseJobPayload>(
    queueId: SupportedJobs[number]['queueId'],
  ): ZodSchema<JobPayload> => {
    return this.supportedJobMap[queueId].jobPayloadSchema as ZodSchema<JobPayload>
  }

  public isSupportedQueue(queueId: string) {
    return this.supportedJobQueues.has(queueId)
  }
}
