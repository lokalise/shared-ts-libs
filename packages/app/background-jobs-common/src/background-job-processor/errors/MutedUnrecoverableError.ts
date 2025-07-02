import { UnrecoverableError } from 'bullmq'

export const MUTED_UNRECOVERABLE_ERROR_SYMBOL = Symbol.for('MUTED_UNRECOVERABLE_ERROR_KEY')

export class MutedUnrecoverableError extends UnrecoverableError {
  public readonly details?: Record<string, unknown>

  constructor(message?: string, details?: Record<string, unknown>) {
    super(message)
    this.name = UnrecoverableError.name
    this.details = details
  }
}

Object.defineProperty(MutedUnrecoverableError.prototype, MUTED_UNRECOVERABLE_ERROR_SYMBOL, {
  value: true,
})
