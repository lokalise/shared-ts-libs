import { z } from 'zod/v4'
import { BaseError } from './BaseError.ts'
import type { BaseErrorOptions } from './BaseError.ts'
import { httpStatusByErrorType } from './constants.ts'
import type { InferDetails, PublicErrorDefinition } from './types.ts'

/**
 * Base class for errors that may be surfaced to clients.
 *
 * Use {@link definePublicError} to create a definition and {@link PublicError.from}
 * to bind it to a class. The factory preserves literal types for `code` and
 * `type` automatically, avoiding the footgun of accidentally omitting `readonly`
 * on an override.
 *
 * @example
 * ```ts
 * const projectNotFoundDef = definePublicError({
 *   code: 'PROJECT_NOT_FOUND',
 *   type: ErrorType.NOT_FOUND,
 *   detailsSchema: z.object({ id: z.string() }),
 * })
 *
 * class ProjectNotFoundError extends PublicError.from(projectNotFoundDef) {
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
 * const rateLimitDef = definePublicError({ code: 'RATE_LIMIT_EXCEEDED', type: ErrorType.RATE_LIMIT })
 * class RateLimitError extends PublicError.from(rateLimitDef) {
 *   constructor() { super({ message: 'Too many requests' }) }
 * }
 * ```
 */
export abstract class PublicError<T extends PublicErrorDefinition> extends BaseError<
  InferDetails<T>
> {
  readonly code: T['code']
  readonly type: T['type']

  /** HTTP status code derived from {@link type}. */
  get httpStatusCode(): number {
    return httpStatusByErrorType[this.type]
  }

  protected constructor(definition: T, options: BaseErrorOptions<InferDetails<T>>) {
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
    return class BoundPublicError extends PublicError<T> {
      constructor(options: BaseErrorOptions<InferDetails<T>>) {
        super(definition, options)
      }
    }
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
 * `schema` is a Zod object with `{ message, code: z.literal(...) }`, plus a
 * typed `details` field when `detailsSchema` is provided. Use it for
 * client-side parsing and discriminated unions:
 *
 * ```ts
 * const errorSchema = z.discriminatedUnion('code', [
 *   projectNotFoundDef.schema,
 *   rateLimitDef.schema,
 * ])
 * ```
 *
 * Pair with {@link PublicError.from} to create the error class.
 *
 * @example
 * ```ts
 * const projectNotFoundDef = definePublicError({
 *   code: 'PROJECT_NOT_FOUND',
 *   type: ErrorType.NOT_FOUND,
 *   detailsSchema: z.object({ id: z.string() }),
 * })
 *
 * class ProjectNotFoundError extends PublicError.from(projectNotFoundDef) {
 *   constructor(id: string) {
 *     super({ message: `Project ${id} not found`, details: { id } })
 *   }
 * }
 * ```
 */
export const definePublicError = <const T extends PublicErrorDefinition>(def: T) => {
  type Schema = T['detailsSchema'] extends z.ZodObject
    ? z.ZodObject<{ message: z.ZodString; code: z.ZodLiteral<T['code']>; details: NonNullable<T['detailsSchema']> }>
    : z.ZodObject<{ message: z.ZodString; code: z.ZodLiteral<T['code']> }>

  const base = { message: z.string(), code: z.literal(def.code) }
  const schema = (def.detailsSchema
    ? z.object({ ...base, details: def.detailsSchema })
    : z.object(base)) as Schema

  return { ...def, schema }
}
