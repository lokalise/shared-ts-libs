import { compile, config, type ZodType } from 'zod/v4'

/**
 * Set on every compiled clone produced by {@link precompileSchema}. Registered on the global symbol
 * registry so that a clone built by one copy of this package is recognized by another copy in the
 * same dependency tree, instead of being handed to `compile` a second time.
 */
const PRECOMPILED_SCHEMA_MARKER = Symbol.for('@lokalise/background-jobs-common/precompiledSchema')

/**
 * Keyed on the schema handed to {@link precompileSchema}, holding whatever came back for it: the
 * compiled clone, or the schema itself when zod refused to compile it. Two queues sharing one
 * schema, or the same configuration array registered by several managers, then compile once.
 */
const precompiledSchemas = new WeakMap<ZodType, ZodType>()

/**
 * Reports whether the schema is a compiled clone produced by {@link precompileSchema}. A schema
 * zod refused to compile is not one: it is handed back as the caller's own object, untouched.
 */
export const isPrecompiledSchema = (schema: ZodType): boolean =>
  (schema as unknown as Record<symbol, unknown>)[PRECOMPILED_SCHEMA_MARKER] === true

/**
 * Builds an ahead-of-time compiled clone of the given schema, which parses noticeably faster than
 * the interpreted one. Every `jobPayloadSchema` on a queue configuration goes through this when the
 * configuration is registered; nothing else needs to call it.
 *
 * The original schema is left untouched, and asking twice for the same schema returns the same
 * clone. Two cases hand the input straight back, and the caller keeps using the runtime parser:
 *
 * - `z.config({ jitless: true })` is set. The flag exists so that CSP/no-eval environments never
 *   reach `new Function`, and it doubles as the way to turn precompilation off.
 * - zod refuses the schema. Async refinements and recursive (self-referential) schemas are the two
 *   shapes to expect; `z.compile(schema, { strict: true })` reports the reason for a given schema.
 *
 * One behavior does change on a compiled clone. The generated fast path only signals that input is
 * invalid, so zod re-runs the original parser to build the error, and a synchronous `refine`,
 * `superRefine` or `transform` therefore runs twice for input that fails validation (once for input
 * that passes). Parse results are identical either way, but a callback with a side effect outside
 * the parse, incrementing a metric for instance, fires twice.
 */
export const precompileSchema = <Schema extends ZodType>(schema: Schema): Schema => {
  if (isPrecompiledSchema(schema)) return schema

  const known = precompiledSchemas.get(schema)
  if (known) return known as Schema

  // Deliberately not cached: the flag can be flipped between calls, and honoring it is the point.
  if (config().jitless) return schema

  const precompiled = compileAndMark(schema)
  precompiledSchemas.set(schema, precompiled)

  return precompiled
}

/**
 * Registering a queue configuration could not fail before payload schemas were compiled, and it
 * still cannot. `compile` documents that it never throws, and anything that escapes it anyway, or
 * escapes marking the clone, costs the fast path rather than the boot.
 */
const compileAndMark = <Schema extends ZodType>(schema: Schema): Schema => {
  try {
    const precompiled = compile(schema)
    if (precompiled === schema) return schema

    Object.defineProperty(precompiled, PRECOMPILED_SCHEMA_MARKER, {
      value: true,
      enumerable: false,
      writable: false,
      configurable: false,
    })

    return precompiled
    /* v8 ignore start */
  } catch {
    return schema
  }
  /* v8 ignore stop */
}
