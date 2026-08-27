import { z } from 'zod'
import { httpStatusByErrorType } from './constants.ts'
import type { PublicErrorDefinition } from './PublicError.ts'

/**
 * A public error definition enriched with its companion payload `schema`, as
 * returned by `definePublicError`.
 */
export type PublicErrorDefinitionWithSchema = PublicErrorDefinition & {
  schema: z.ZodObject
}

/** HTTP status code derived from a definition's `type`. */
type StatusCodeOf<TDefinition extends PublicErrorDefinition> =
  (typeof httpStatusByErrorType)[TDefinition['type']]

// Distributes over a union of definitions, keeping the ones whose derived
// status code matches TStatusCode.
type DefinitionsForStatusCode<
  TDefinition extends PublicErrorDefinitionWithSchema,
  TStatusCode extends number,
> = TDefinition extends unknown
  ? StatusCodeOf<TDefinition> extends TStatusCode
    ? TDefinition
    : never
  : never

/**
 * Return type of {@link mergeErrorSchemasByStatusCode}: literal status code
 * keys, each mapping to a schema whose output is the union of the payloads of
 * the definitions sharing that status code.
 */
export type MergedErrorSchemasByStatusCode<
  TDefinitions extends readonly PublicErrorDefinitionWithSchema[],
> = {
  [TStatusCode in StatusCodeOf<TDefinitions[number]>]: z.ZodType<
    z.output<DefinitionsForStatusCode<TDefinitions[number], TStatusCode>['schema']>
  >
}

/**
 * Groups public error definitions by the HTTP status code derived from their
 * `type`, producing `{ [statusCode]: payloadSchema }` — ready to be spread
 * into an API contract's `responsesByStatusCode`.
 *
 * A status code claimed by a single definition maps to that definition's
 * `schema` as-is; a status code shared by several definitions maps to a
 * `z.discriminatedUnion('code', ...)` of their schemas, so error codes must be
 * unique within a status code. Duplicate codes throw here, at merge time —
 * zod builds the discriminator map lazily, so without this check the
 * duplicate would only surface on the first parse.
 *
 * Both the status code keys and the payload types (literal `code`, typed
 * `details`) are preserved at the type level, so clients consuming the
 * contract can discriminate error responses by `code`.
 *
 * @example
 * ```ts
 * const contract = defineApiContract({
 *   // ...
 *   responsesByStatusCode: {
 *     200: projectSchema,
 *     ...mergeErrorSchemasByStatusCode([
 *       projectNotFoundErrorDefinition,
 *       projectNameAlreadyExistsErrorDefinition,
 *     ]),
 *     // → { 404: <not-found schema>, 409: <conflict schema> }
 *   },
 * })
 * ```
 */
export const mergeErrorSchemasByStatusCode = <
  const TDefinitions extends readonly PublicErrorDefinitionWithSchema[],
>(
  definitions: TDefinitions,
): MergedErrorSchemasByStatusCode<TDefinitions> => {
  const groupsByStatusCode = new Map<number, { codes: Set<string>; schemas: z.ZodObject[] }>()

  for (const definition of definitions) {
    const statusCode = httpStatusByErrorType[definition.type]
    const group = groupsByStatusCode.get(statusCode) ?? { codes: new Set<string>(), schemas: [] }
    if (group.codes.has(definition.code)) {
      throw new Error(
        `Duplicate error code '${definition.code}' for status code ${statusCode}: error codes must be unique within a status code`,
      )
    }
    group.codes.add(definition.code)
    group.schemas.push(definition.schema)
    groupsByStatusCode.set(statusCode, group)
  }

  const result: Record<number, z.ZodType> = {}

  for (const [statusCode, { schemas }] of groupsByStatusCode) {
    const [firstSchema] = schemas
    result[statusCode] =
      schemas.length === 1 && firstSchema
        ? firstSchema
        : z.discriminatedUnion('code', schemas as [z.ZodObject, ...z.ZodObject[]])
  }

  return result as MergedErrorSchemasByStatusCode<TDefinitions>
}
