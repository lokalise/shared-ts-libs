import { isError } from '@lokalise/node-core'
import type { UnrecoverableError } from 'bullmq'
import {
  MUTED_UNRECOVERABLE_ERROR_SYMBOL,
  type MutedUnrecoverableError,
} from './MutedUnrecoverableError.ts'

export const isUnrecoverableJobError = (error: Error): error is UnrecoverableError =>
  error.name === 'UnrecoverableError'

export const isMutedUnrecoverableJobError = (error: Error): error is MutedUnrecoverableError =>
  // biome-ignore lint/suspicious/noExplicitAny: checking for existence of prop outside or Error interface
  isUnrecoverableJobError(error) && (error as any)[MUTED_UNRECOVERABLE_ERROR_SYMBOL] === true

export const isStalledJobError = (error: Error): boolean =>
  error.message === 'job stalled more than allowable limit'

export const isJobMissingError = (error: unknown): boolean =>
  isError(error) && error.message.startsWith('Missing key for job')
