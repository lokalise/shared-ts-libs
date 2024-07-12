import type { Job } from 'bullmq'

import type { JobFinalState } from '../types'

export type JobSpyState = JobFinalState | 'scheduled'
export type JobDataSelector<JobData extends object> = (jobData: JobData) => boolean
export type JobSpyResult<JobData extends object, jobReturn> = Pick<
  Job<JobData, jobReturn>,
  'data' | 'attemptsMade' | 'id' | 'progress' | 'returnvalue' | 'failedReason' | 'finishedOn'
>

export interface BackgroundJobProcessorSpyInterface<JobData extends object, jobReturn> {
  clear(): void
  waitForJob(
    jobSelector: JobDataSelector<JobData>,
    state: JobSpyState,
  ): Promise<JobSpyResult<JobData, jobReturn>>

  waitForJobWithId(
    id: string | undefined,
    awaitedState: JobSpyState,
  ): Promise<JobSpyResult<JobData, jobReturn>>
}
