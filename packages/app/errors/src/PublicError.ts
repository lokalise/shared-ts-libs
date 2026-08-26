import { z } from 'zod'
import type { ErrorType } from './constants.ts'
import { httpStatusByErrorType } from './constants.ts'
import type { EnhancedErrorOptions } from './EnhancedError.ts'
import { EnhancedError } from './EnhancedError.ts'

/**
 * Reusable specification for a public error: unique code, error category, and
 * an optional Zod schema for type-safe details and OpenAPI schema generation.
 */
export interface PublicErrorDefinition {
  /** Unique error code — becomes a literal type for TS discrimination */
  code: string
  /** Error category for protocol-agnostic error handling */
  type: ErrorType
  /** Optional Zod object schema — makes `details` required and typed when provided */
  detailsSchema?: z.ZodObject
}

/**
 * Infers the TypeScript type of error details from a Zod schema.
 *
 * For the wide {@link PublicErrorDefinition} type (where `detailsSchema` may or
 * may not be present), details resolve to `Record<string, unknown> | undefined`
 * so generic error handlers can still inspect them.
 */
export type InferPublicErrorDetails<TDef extends PublicErrorDefinition> =
  TDef['detailsSchema'] extends z.ZodObject
    ? z.infer<TDef['detailsSchema']>
    : [Extract<TDef['detailsSchema'], z.ZodObject>] extends [never]
      ? undefined
      : z.infer<Extract<TDef['detailsSchema'], z.ZodObject>> | undefined

/**
 * Options accepted by {@link PublicError} subclass constructors.
 *
 * `details` is required (and typed) when the definition includes a
 * `detailsSchema`, and absent otherwise.
 */
export type PublicErrorOptions<T extends PublicErrorDefinition> = EnhancedErrorOptions<
  InferPublicErrorDetails<T>
>

/**
 * Client-facing payload of a {@link PublicError} — the shape validated by the
 * definition's companion `schema`. `details` is present exactly when the
 * definition declares a `detailsSchema`.
 */
export type PublicErrorPayload<T extends PublicErrorDefinition> = {
  message: string
  code: T['code']
  /** @deprecated Use {@link code} instead — node-core compatibility alias. */
  errorCode: T['code']
} & (T['detailsSchema'] extends z.ZodObject
  ? { details: InferPublicErrorDetails<T> }
  : { details?: never })

/**
 * Base class for errors that may be surfaced to clients.
 *
 * Use {@link definePublicError} to create a definition and {@link PublicError.from}
 * to bind it to a class. The constructor is private, so the factory is the only
 * way to create concrete classes. It preserves literal types for `code` and
 * `type` automatically, avoiding the footgun of accidentally omitting `readonly`
 * on an override.
 *
 * @example
 * ```ts
 * const projectNotFoundErrorDefinition = definePublicError({
 *   code: 'PROJECT_NOT_FOUND',
 *   type: ErrorType.NOT_FOUND,
 *   detailsSchema: z.object({ id: z.string() }),
 * })
 *
 * class ProjectNotFoundError extends PublicError.from(projectNotFoundErrorDefinition) {
 *   constructor(id: string) {
 *     super({ message: `Project ${id} not found`, details: { id } })
 *   }
 * }
 *
 * const error = new ProjectNotFoundError('abc')
 * error.code           // 'PROJECT_NOT_FOUND'
 * error.type           // 'not-found'
 * error.httpStatusCode // 404
 * error.details        // { id: string }
 * ```
 *
 * @example Without details schema
 * ```ts
 * const rateLimitErrorDefinition = definePublicError({ code: 'RATE_LIMIT_EXCEEDED', type: ErrorType.RATE_LIMIT })
 * class RateLimitError extends PublicError.from(rateLimitErrorDefinition) {
 *   constructor() { super({ message: 'Too many requests' }) }
 * }
 * ```
 */
export abstract class PublicError<
  T extends PublicErrorDefinition = PublicErrorDefinition,
> extends EnhancedError<InferPublicErrorDetails<T>> {
  readonly code: T['code']
  readonly type: T['type']

  /** HTTP status code derived from {@link type}. */
  get httpStatusCode(): number {
    return httpStatusByErrorType[this.type]
  }

  /**
   * Returns the client-facing payload: `message`, `code`, and `details` when
   * the definition declares a `detailsSchema`. Excludes non-public fields
   * (`stack`, `cause`, `name`) and always satisfies the definition's `schema`.
   *
   * Also includes the deprecated `errorCode` alias of `code` for
   * `@lokalise/node-core` compatibility; it will be dropped in a future major.
   */
  toPayload(): PublicErrorPayload<T> {
    return {
      message: this.message,
      code: this.code,
      errorCode: this.code,
      ...(this.details !== undefined && { details: this.details }),
    } as PublicErrorPayload<T>
  }

  // Private so `from` is the only extension point — a direct subclass could
  // silently widen `code`/`type` by omitting `readonly` on the overrides.
  private constructor(definition: T, options: PublicErrorOptions<T>) {
    super(options)
    this.code = definition.code
    this.type = definition.type
  }

  /**
   * Creates a class bound to the given error definition.
   *
   * The returned class can be extended or instantiated directly. Its
   * constructor accepts `{ message, details?, cause? }` where `details` is
   * required when the definition includes a `detailsSchema`.
   */
  static from<const T extends PublicErrorDefinition>(definition: T) {
    class BoundPublicError extends PublicError<T> {
      constructor(options: PublicErrorOptions<T>) {
        super(definition, options)
      }
    }
    // A per-definition class name keeps the Symbol.hasInstance prototype paths
    // distinct — otherwise bound classes of different definitions would all
    // share the 'BoundPublicError' path segment and match each other.
    Object.defineProperty(BoundPublicError, 'name', { value: `PublicError<${definition.code}>` })
    return BoundPublicError
  }
}

/**
 * Creates a public error definition with preserved literal types, and a
 * companion `schema` for validating / deserializing the serialized error shape.
 *
 * The `const` type parameter ensures `code` stays a literal type (not widened
 * to `string`), which is what enables TypeScript discrimination between
 * different error classes.
 *
 * `schema` is a Zod object with `{ message, code: z.literal(...) }` (plus a
 * typed `details` field when `detailsSchema` is provided, and an `errorCode`
 * alias of `code` for node-core compatibility, marked deprecated in the schema
 * metadata). Use it for client-side parsing and discriminated unions:
 *
 * ```ts
 * const errorSchema = z.discriminatedUnion('code', [
 *   projectNotFoundErrorDefinition.schema,
 *   rateLimitErrorDefinition.schema,
 * ])
 * ```
 *
 * Pair with {@link PublicError.from} to create the error class.
 *
 * @example
 * ```ts
 * const projectNotFoundErrorDefinition = definePublicError({
 *   code: 'PROJECT_NOT_FOUND',
 *   type: ErrorType.NOT_FOUND,
 *   detailsSchema: z.object({ id: z.string() }),
 * })
 *
 * class ProjectNotFoundError extends PublicError.from(projectNotFoundErrorDefinition) {
 *   constructor(id: string) {
 *     super({ message: `Project ${id} not found`, details: { id } })
 *   }
 * }
 * ```
 */
export const definePublicError = <const T extends PublicErrorDefinition>(def: T) => {
  type Schema = T['detailsSchema'] extends z.ZodObject
    ? z.ZodObject<{
        message: z.ZodString
        code: z.ZodLiteral<T['code']>
        errorCode: z.ZodLiteral<T['code']>
        details: NonNullable<T['detailsSchema']>
      }>
    : z.ZodObject<{
        message: z.ZodString
        code: z.ZodLiteral<T['code']>
        errorCode: z.ZodLiteral<T['code']>
      }>

  const base = {
    message: z.string(),
    code: z.literal(def.code),
    // Deprecated node-core compatibility alias of `code`; the metadata flows
    // into generated JSON Schema / OpenAPI output.
    errorCode: z.literal(def.code).meta({ deprecated: true }),
  }
  const schema = (
    def.detailsSchema ? z.object({ ...base, details: def.detailsSchema }) : z.object(base)
  ) as Schema

  return { ...def, schema }
}
