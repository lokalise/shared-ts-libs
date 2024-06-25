import type { Job } from 'bullmq'

import type { JobFinalState } from '../types'

export type JobDataSelector<JobData extends object> = (jobData: JobData) => boolean
export type JobSpyResult<JobData extends object, jobReturn> = Pick<
	Job<JobData, jobReturn>,
	'data' | 'attemptsMade' | 'id' | 'progress' | 'returnvalue' | 'failedReason' | 'finishedOn'
>

export interface BackgroundJobProcessorSpyInterface<JobData extends object, JobReturn> {
	clear(): void
	waitForFinishedJob(
		jobSelector: JobDataSelector<JobData>,
		state: JobFinalState,
	): Promise<JobSpyResult<JobData, JobReturn>>

	waitForFinishedJobWithId(
		id: string | undefined,
		awaitedState: JobFinalState,
	): Promise<JobSpyResult<JobData, JobReturn>>

	waitForScheduledJob(
		jobSelector: JobDataSelector<JobData>,
	): Promise<JobSpyResult<JobData, JobReturn>>
}
