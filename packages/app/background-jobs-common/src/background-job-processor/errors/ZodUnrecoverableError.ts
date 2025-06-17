import { UnrecoverableError } from 'bullmq'
import { ZodError } from 'zod/v4'

export class ZodUnrecoverableError extends ZodError implements UnrecoverableError {
  constructor(error: ZodError) {
    super(error.issues)

    this.name = UnrecoverableError.name // Needed to be fully compatible with BullMQ UnrecoverableError
    this.cause = error
  }
}
