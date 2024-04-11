import type { Job } from 'bullmq'

import type { JobFinalState } from '../../types'

export type JobDataSelector<JobData extends object> = (jobData: JobData) => boolean
export type JobSpyResult<JobData extends object> = Pick<
	Job<JobData>,
	'data' | 'attemptsMade' | 'id' | 'progress'
>

export interface BackgroundJobProcessorSpyInterface<JobData extends object> {
	clear(): void
	waitForJob(
		jobSelector: JobDataSelector<JobData>,
		state: JobFinalState,
	): Promise<JobSpyResult<JobData>>

	waitForJobWithId(
		id: string | undefined,
		awaitedState: JobFinalState,
	): Promise<JobSpyResult<JobData>>
}
