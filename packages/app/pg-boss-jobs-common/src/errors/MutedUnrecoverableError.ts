import { UnrecoverableError } from './UnrecoverableError.ts'

/** The key `@lokalise/background-jobs-common` uses, so its `MutedUnrecoverableError` is muted here too. */
export const MUTED_UNRECOVERABLE_ERROR_SYMBOL = Symbol.for('MUTED_UNRECOVERABLE_ERROR_KEY')

/** An {@link UnrecoverableError} that is logged but never sent to the error reporter. */
export class MutedUnrecoverableError extends UnrecoverableError {
  public readonly details?: Record<string, unknown>

  constructor(message?: string, details?: Record<string, unknown>) {
    super(message)
    this.details = details
  }
}

Object.defineProperty(MutedUnrecoverableError.prototype, MUTED_UNRECOVERABLE_ERROR_SYMBOL, {
  value: true,
})
