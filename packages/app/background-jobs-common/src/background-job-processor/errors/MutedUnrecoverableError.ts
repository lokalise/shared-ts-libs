import { UnrecoverableError } from 'bullmq'

export const MUTED_UNRECOVERABLE_ERROR_SYMBOL = Symbol.for('MUTED_UNRECOVERABLE_ERROR_KEY')

export class MutedUnrecoverableError extends UnrecoverableError {}

Object.defineProperty(MutedUnrecoverableError.prototype, MUTED_UNRECOVERABLE_ERROR_SYMBOL, {
  value: true,
})
