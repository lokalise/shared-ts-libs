import { compile, type ZodType } from 'zod/v4'

/**
 * Set on every schema returned by {@link precompileSchema}. Registered on the global symbol
 * registry so that two copies of this package within one dependency tree recognize each other's
 * work instead of compiling the same schema twice.
 */
const PRECOMPILED_SCHEMA_MARKER = Symbol.for('@lokalise/background-jobs-common/precompiledSchema')

/**
 * Schemas that zod's fast path cannot model (async refinements, unsupported features). `compile`
 * hands those back untouched, and there is no place to put the marker without mutating a schema
 * the caller owns, so they are remembered here to keep repeated registrations cheap.
 */
const nonCompilableSchemas = new WeakSet<ZodType>()

/**
 * Phantom property, never present at runtime. It exists so that a precompiled schema is
 * distinguishable from a plain one at the type level.
 */
type PrecompiledSchemaBrand = {
  readonly __precompiledSchema: true
}

/** A schema whose validation fast path has already been built by {@link precompileSchema}. */
export type PrecompiledSchema<Schema> = Schema & PrecompiledSchemaBrand

/**
 * Marks an API position that takes a schema this library has not seen yet. Every registered schema
 * is precompiled on registration, so handing over an already precompiled one is duplicated work;
 * this type turns that into a compile error.
 */
export type NonPrecompiledSchema<Schema> = Schema & {
  readonly __precompiledSchema?: 'this schema is already precompiled, pass the original one instead'
}

/**
 * Reports whether the schema is a compiled clone produced by {@link precompileSchema}. A schema
 * zod refused to compile is not one: it is handed back as the caller's own object, which is left
 * untouched.
 */
export const isPrecompiledSchema = <Schema extends ZodType>(
  schema: Schema,
): schema is PrecompiledSchema<Schema> =>
  (schema as unknown as Record<symbol, unknown>)[PRECOMPILED_SCHEMA_MARKER] === true

/**
 * Builds an ahead-of-time compiled clone of the given schema, which parses noticeably faster than
 * the interpreted one. Users of this library never need to call it: every `jobPayloadSchema` on a
 * queue configuration is precompiled when the configuration is registered.
 *
 * The original schema is left untouched, and the call is idempotent: a schema that already went
 * through it is returned as is. A schema zod refuses to compile keeps using the regular runtime
 * parser, with no observable difference for the caller.
 */
export const precompileSchema = <Schema extends ZodType>(
  schema: Schema,
): PrecompiledSchema<Schema> => {
  if (isPrecompiledSchema(schema)) return schema
  if (nonCompilableSchemas.has(schema)) return schema as PrecompiledSchema<Schema>

  const precompiled = compile(schema)
  if (precompiled === schema) {
    nonCompilableSchemas.add(schema)
    return schema as PrecompiledSchema<Schema>
  }

  Object.defineProperty(precompiled, PRECOMPILED_SCHEMA_MARKER, {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false,
  })

  return precompiled as PrecompiledSchema<Schema>
}
