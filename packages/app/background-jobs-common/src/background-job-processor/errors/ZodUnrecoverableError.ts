import { UnrecoverableError } from 'bullmq'
import { ZodError } from 'zod'

export class ZodUnrecoverableError extends ZodError implements UnrecoverableError {
  constructor(error: ZodError) {
    super(error.errors)

    this.name = UnrecoverableError.name // Needed to be fully compatible with BullMQ UnrecoverableError
    this.cause = error
  }
}
