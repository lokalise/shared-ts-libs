/**
 * Options accepted by every error constructor.
 *
 * `details` is required when `TDetails` is a concrete type, and optional
 * (or absent) when `TDetails` is `undefined`.
 */
export type BaseErrorOptions<TDetails> = {
  message: string
  cause?: unknown
} & (undefined extends TDetails ? { details?: TDetails } : { details: TDetails })

/**
 * Shared abstract base for all application errors.
 *
 * Do NOT extend this directly — use {@link InternalError} for non-public
 * operational errors or {@link PublicError} for errors surfaced to clients.
 */
export abstract class BaseError<TDetails = undefined> extends Error {
  /**
   * Stable, unique string identifier for this error class.
   * Must be declared `readonly` in every subclass to enable TS narrowing.
   */
  abstract readonly code: string

  readonly details: TDetails

  constructor(options: BaseErrorOptions<TDetails>) {
    super(options.message, { cause: options.cause })
    this.name = this.constructor.name
    // Cast needed because the conditional type is not narrowed by the compiler here.
    this.details = options.details as TDetails
  }
}
