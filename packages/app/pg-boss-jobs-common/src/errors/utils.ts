import { isError } from '@lokalise/node-core'
import { MUTED_UNRECOVERABLE_ERROR_SYMBOL } from './MutedUnrecoverableError.ts'

export const isUnrecoverableJobError = (error: unknown): boolean =>
  isError(error) && error.name === 'UnrecoverableError'

export const isMutedUnrecoverableJobError = (error: unknown): boolean =>
  isUnrecoverableJobError(error) &&
  (error as unknown as Record<symbol, unknown>)[MUTED_UNRECOVERABLE_ERROR_SYMBOL] === true

export const normalizeError = (error: unknown): Error =>
  isError(error) ? error : new Error(String(error))
