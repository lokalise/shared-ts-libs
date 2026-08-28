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

// Bound classes used by `create`, one per code. Reusing the class keeps
// repeated create() calls with the same code from minting a new class (and
// recomputing its identity symbols) on every throw.
const boundClassesByCode = new Map<
  string,
  new (
    options: InternalErrorOptions<ErrorDetails | undefined>,
  ) => InternalError<ErrorDetails | undefined>
>()

/**
 * Base class for non-public, operational errors.
 *
 * Use this for errors that represent in-process runtime conditions (e.g. a
 * downstream timeout, a failed lock acquisition) that should never be surfaced
 * to clients. Protocol mapping is intentionally absent.
 *
 * The constructor is private, so {@link InternalError.from} is the only way to
 * create concrete classes — it preserves the literal type of `code`
 * automatically. A direct subclass would have to declare `code` as
 * `override readonly` itself; omitting `readonly` widens the literal to
 * `string` without a compile error, silently breaking TS discrimination.
 *
 * For one-off errors where a dedicated class is not worth maintaining,
 * {@link InternalError.create} builds an instance directly.
 *
 * @example Without details
 * ```ts
 * class TranslatorTimeoutError extends InternalError.from('TRANSLATOR_TIMEOUT') {
 *   constructor(translatorId: string) {
 *     super({ message: `Translator ${translatorId} timed out` })
 *   }
 * }
 * ```
 *
 * @example With typed details (passed as a type argument in the extends clause)
 * ```ts
 * class DatabaseQueryError extends InternalError.from('DATABASE_QUERY_ERROR')<{ query: string }> {
 *   constructor(query: string, cause?: unknown) {
 *     super({ message: 'Database query failed', details: { query }, cause })
 *   }
 * }
 * ```
 */
export abstract class InternalError<
  TDetails extends ErrorDetails | undefined = undefined,
> extends EnhancedError<TDetails> {
  // Private so `from` is the only extension point — a direct subclass could
  // silently widen `code` to `string` by omitting `readonly` on the override.
  private constructor(options: InternalErrorOptions<TDetails>) {
    super(options)
  }

  /**
   * Creates a one-off error instance without declaring a dedicated class.
   *
   * Use for internal errors whose code is only read generically (e.g. in
   * logging), where a named class is not worth maintaining:
   *
   * ```ts
   * throw InternalError.create({
   *   code: 'LQA_REVIEW_MISSING',
   *   message: 'LQA produced no review for the segment',
   * })
   * ```
   *
   * `code` keeps its literal type and `details` is typed from the provided
   * value. Prefer {@link from} when handlers or tests need to match the error
   * by class — created instances can only be checked with
   * `InternalError.isInstance` plus a `code` comparison. Identity matches
   * {@link from}: instances sharing a code share one class named
   * `InternalError<CODE>`, so `InternalError.from(code).isInstance(err)` also
   * matches errors created with the same code.
   */
  static create<
    const TCode extends string,
    TDetails extends ErrorDetails | undefined = undefined,
  >(options: {
    code: TCode
    message: string
    details?: TDetails
    cause?: unknown
  }): InternalError<TDetails> & { readonly code: TCode } {
    const { code, ...constructorOptions } = options

    let BoundClass = boundClassesByCode.get(code)

    if (!BoundClass) {
      BoundClass = InternalError.from(code)
      boundClassesByCode.set(code, BoundClass)
    }

    return new BoundClass(constructorOptions) as InternalError<TDetails> & {
      readonly code: TCode
    }
  }

  /**
   * Creates a class bound to the given error code.
   *
   * The returned class can be extended or instantiated directly. It is generic
   * over the details type, supplied as a type argument in the extends clause:
   * `class Foo extends InternalError.from('FOO')<{ id: string }> {}`. Its
   * constructor accepts `{ message, details?, cause? }` where `details` is
   * required when a details type is supplied.
   *
   * The `const` type parameter keeps `code` a literal type (not widened to
   * `string`), so cross-error assignments stay compile errors — without
   * relying on subclass authors remembering `override readonly`.
   *
   * The bound class is named `InternalError<CODE>`, making the code part of
   * the cross-realm identity path (see {@link EnhancedError}). Changing a
   * code therefore breaks `isInstance` across realms and package copies,
   * exactly like renaming a class.
   */
  static from<const TCode extends string>(code: TCode) {
    class BoundInternalError<
      TDetails extends ErrorDetails | undefined = undefined,
    > extends InternalError<TDetails> {
      override readonly code = code

      // Redeclares the inherited private constructor as public — without this,
      // consumers could neither extend nor instantiate the bound class.
      // biome-ignore lint/complexity/noUselessConstructor: changes accessibility
      public constructor(options: InternalErrorOptions<TDetails>) {
        super(options)
      }
    }
    // A per-code class name keeps the Symbol.hasInstance prototype paths
    // distinct — otherwise bound classes of different codes would all share
    // the 'BoundInternalError' path segment and match each other.
    Object.defineProperty(BoundInternalError, 'name', { value: `InternalError<${code}>` })
    return BoundInternalError
  }
}
