/**
 * Throw from `process` for a failure that retrying cannot fix: the job skips its remaining retries
 * and goes straight to the dead letter queue.
 *
 * Recognized by `name`, as BullMQ does, so an `UnrecoverableError` from BullMQ or from
 * `@lokalise/background-jobs-common` has the same effect.
 */
export class UnrecoverableError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'UnrecoverableError'
  }
}
