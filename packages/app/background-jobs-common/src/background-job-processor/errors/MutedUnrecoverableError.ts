import { UnrecoverableError } from 'bullmq'

export const MUTED_UNRECOVERABLE_ERROR_SYMBOL = Symbol.for('MUTED_UNRECOVERABLE_ERROR_KEY')

export class MutedUnrecoverableError extends UnrecoverableError {
  constructor(message?: string, public readonly cause?: unknown) {
    super(message)
    this.name = UnrecoverableError.name
  }
}

Object.defineProperty(MutedUnrecoverableError.prototype, MUTED_UNRECOVERABLE_ERROR_SYMBOL, {
  value: true,
})
