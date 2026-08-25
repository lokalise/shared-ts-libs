import type { EnhancedErrorOptions } from './EnhancedError.ts'
import { EnhancedError } from './EnhancedError.ts'

export type ErrorDetails = Record<string, unknown>

/**
 * Options accepted by {@link InternalError} subclass constructors.
 *
 * `details` is required when `TDetails` is a concrete type, and optional
 * (or absent) when `TDetails` is `undefined`.
 */
export type InternalErrorOptions<TDetails extends ErrorDetails | undefined = undefined> =
  EnhancedErrorOptions<TDetails>

/**
 * Base class for non-public, operational errors.
 *
 * Use this for errors that represent in-process runtime conditions (e.g. a
 * downstream timeout, a failed lock acquisition) that should never be surfaced
 * to clients. Protocol mapping is intentionally absent.
 *
 * @example Without details
 * ```ts
 * class TranslatorTimeoutError extends InternalError {
 *   override readonly code = 'TRANSLATOR_TIMEOUT'
 *
 *   constructor(translatorId: string) {
 *     super({ message: `Translator ${translatorId} timed out` })
 *   }
 * }
 * ```
 *
 * @example With typed details
 * ```ts
 * class DatabaseQueryError extends InternalError<{ query: string }> {
 *   override readonly code = 'DATABASE_QUERY_ERROR'
 *
 *   constructor(query: string, cause?: unknown) {
 *     super({ message: 'Database query failed', details: { query }, cause })
 *   }
 * }
 * ```
 */
export abstract class InternalError<
  TDetails extends ErrorDetails | undefined = undefined,
> extends EnhancedError<TDetails> {}
