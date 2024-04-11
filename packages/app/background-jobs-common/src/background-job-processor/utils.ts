import type { Job } from 'bullmq'

export const daysToSeconds = (days: number): number => days * 24 * 60 * 60

export const daysToMilliseconds = (days: number): number => daysToSeconds(days) * 1000

export const resolveJobId = (job?: Job<unknown>): string => job?.id ?? 'unknown'

export const isStalledJobError = (error: Error): boolean =>
	error.message === 'job stalled more than allowable limit'
