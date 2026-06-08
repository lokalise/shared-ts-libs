import { isError } from '@lokalise/node-core'
import { DelayedError, RateLimitError, UnrecoverableError, WaitingChildrenError } from 'bullmq'
import {
  MUTED_UNRECOVERABLE_ERROR_SYMBOL,
  type MutedUnrecoverableError,
} from './MutedUnrecoverableError.ts'

export const isUnrecoverableJobError = (error: Error): error is UnrecoverableError =>
  error.name === UnrecoverableError.name

export const isMutedUnrecoverableJobError = (error: Error): error is MutedUnrecoverableError =>
  // biome-ignore lint/suspicious/noExplicitAny: checking for existence of prop outside or Error interface
  isUnrecoverableJobError(error) && (error as any)[MUTED_UNRECOVERABLE_ERROR_SYMBOL] === true

export const isStalledJobError = (error: Error): boolean =>
  error.message === 'job stalled more than allowable limit'

export const isJobMissingError = (error: unknown): boolean =>
  isError(error) && error.message.startsWith('Missing key for job')

const BULLMQ_CONTROL_FLOW_ERROR_NAMES: ReadonlySet<string> = new Set([
  DelayedError.name,
  WaitingChildrenError.name,
  RateLimitError.name,
])

// BullMQ uses these errors as cooperative signals from a processor to move a job
// to a different state (delayed, waiting-children, rate-limited). They are control
// flow, not failures, so they should not be reported as job errors.
export const isBullmqControlFlowError = (error: unknown): boolean =>
  isError(error) && BULLMQ_CONTROL_FLOW_ERROR_NAMES.has(error.name)
