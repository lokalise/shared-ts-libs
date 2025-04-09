import { UnrecoverableError } from 'bullmq'

export const MUTED_UNRECOVERABLE_ERROR_SYMBOL = Symbol.for('MUTED_UNRECOVERABLE_ERROR_KEY')
const UNRECOVERABLE_ERROR_NAME = 'UnrecoverableError'

export class MutedUnrecoverableError extends UnrecoverableError {
    constructor(message?: string) {
        super(message)
        this.name = UNRECOVERABLE_ERROR_NAME
    }
}

Object.defineProperty(MutedUnrecoverableError.prototype, MUTED_UNRECOVERABLE_ERROR_SYMBOL, {
    value: true,
})