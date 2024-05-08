import type { Job } from 'bullmq'

import type { JobFinalState } from '../../types'

export type JobDataSelector<JobData extends object> = (jobData: JobData) => boolean
export type JobSpyResult<JobData extends object, jobReturn> = Pick<
	Job<JobData, jobReturn>,
	'data' | 'attemptsMade' | 'id' | 'progress' | 'returnvalue' | 'failedReason'
>

export interface BackgroundJobProcessorSpyInterface<JobData extends object, jobReturn> {
	clear(): void
	waitForJob(
		jobSelector: JobDataSelector<JobData>,
		state: JobFinalState,
	): Promise<JobSpyResult<JobData, jobReturn>>

	waitForJobWithId(
		id: string | undefined,
		awaitedState: JobFinalState,
	): Promise<JobSpyResult<JobData, jobReturn>>
}
