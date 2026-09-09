import type { ApiContract, InferSchemaInput } from '@lokalise/api-contracts'
import { z } from 'zod/v4'
import {
  type FallbackParamsPart,
  FallbackParamsValidationError,
  FallbackUnsupportedParamError,
} from './errors.ts'
import type { FallbackRequestParams } from './types.ts'

type Prettify<T> = { [K in keyof T]: T[K] } & {}

type RequiredWhenDefined<T, TKey extends string> = [T] extends [undefined]
  ? { [K in TKey]?: undefined }
  : { [K in TKey]: T }

/**
 * Like {@link RequiredWhenDefined}, but for the one part a subscription may
 * legitimately supply only in part.
 *
 * A request's headers come from two layers: these, captured once, and the
 * transport's own `headers` option, resolved fresh for every poll and every
 * reconnect. `requestHeaderSchema` describes the request, not this layer's
 * contribution to it, so demanding all of it here would force a rotating
 * credential into the layer that cannot refresh it. What *is* supplied is
 * still checked against the contract.
 */
type PartialWhenDefined<T, TKey extends string> = [T] extends [undefined]
  ? { [K in TKey]?: undefined }
  : { [K in TKey]?: Partial<T> }

type ExtractRequestBody<T> = T extends { requestBodySchema: z.ZodType }
  ? T['requestBodySchema']
  : undefined

/**
 * Subscription params typed from a contract: the same inference
 * `sendByApiContract` applies to a one-shot request, applied to the params a
 * fallback subscription is created with.
 */
export type FallbackContractParams<TContract extends ApiContract> = Prettify<
  RequiredWhenDefined<InferSchemaInput<TContract['requestPathParamsSchema']>, 'pathParams'> &
    RequiredWhenDefined<InferSchemaInput<ExtractRequestBody<TContract>>, 'body'> &
    RequiredWhenDefined<InferSchemaInput<TContract['requestQuerySchema']>, 'queryParams'> &
    PartialWhenDefined<InferSchemaInput<TContract['requestHeaderSchema']>, 'headers'>
>

function validate(
  schema: z.ZodType | undefined,
  value: unknown,
  part: FallbackParamsPart,
  contract: ApiContract,
): unknown {
  if (!schema || value === undefined) return value

  const result = schema.safeParse(value)
  if (!result.success) {
    throw new FallbackParamsValidationError(
      `Invalid ${part} for subscription to "${contract.summary}": ${result.error.message}`,
      { part, summary: contract.summary, issues: result.error.issues },
    )
  }
  return result.data
}

type QueryScalar = string | number | boolean

const isQueryScalar = (value: unknown): value is QueryScalar =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'

/**
 * Render one query value as something a flat string map can carry.
 *
 * The parsed *output* comes first, so Zod defaults and normalizing transforms
 * apply. But a query schema is free to parse a query string into a value the
 * wire has no room for — `z.coerce.date()` yields a `Date` — and there is no
 * scalar a caller could pass to satisfy such a schema, so rejecting it would
 * make a contract `sendByApiContract` accepts unusable here. Falling back to
 * what the caller supplied is therefore not a workaround: it is exactly the
 * value `sendByApiContract` puts on the query string for the same contract,
 * which is what keeps the two request paths agreeing on the wire.
 */
function renderQueryValue(output: unknown, supplied: unknown): QueryScalar | undefined {
  if (isQueryScalar(output)) return output
  if (isQueryScalar(supplied)) return supplied
  // A value the caller never supplied (a Zod default) still has to reach the
  // wire, and a date has one obvious rendering.
  if (output instanceof Date) return output.toISOString()
  return undefined
}

/**
 * A fallback binding's request shape carries query parameters as
 * `Record<string, string>`, so a repeated key (`?tag=a&tag=b`) has nowhere to
 * live. Rejecting the value beats silently sending `tag=a%2Cb`, which the
 * server would read as one tag named `a,b`.
 */
function flattenQueryParams(
  parsed: Record<string, unknown>,
  supplied: Record<string, unknown>,
  contract: ApiContract,
): Record<string, QueryScalar> {
  const flattened: Record<string, QueryScalar> = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (value === undefined || value === null) continue
    const rendered = renderQueryValue(value, supplied[key])
    if (rendered !== undefined) {
      flattened[key] = rendered
      continue
    }
    throw new FallbackUnsupportedParamError(
      `Query parameter "${key}" of "${contract.summary}" is ${
        Array.isArray(value) ? 'a list' : 'structured'
      }, which a fallback subscription request cannot carry: its query is a flat string map. ` +
        'Pass a scalar (join the values yourself if the endpoint expects one string), or move the value into the path.',
      { part: 'queryParams', summary: contract.summary, param: key },
    )
  }
  return flattened
}

/**
 * The schema the headers supplied here are checked against.
 *
 * Every key is made optional first. A contract may declare an `authorization`
 * header that the transport's own `headers` option supplies fresh per request
 * — which is where a rotating credential belongs, and what this function's
 * docs send callers to — so demanding it at subscription-creation time would
 * reject the very setup it recommends. What *is* supplied still gets checked,
 * which is the point.
 */
function suppliedHeadersSchema(schema: z.ZodType | undefined): z.ZodType | undefined {
  return schema instanceof z.ZodObject ? schema.partial() : schema
}

/**
 * Build the params a fallback subscription is created with, typed and
 * validated against the contract.
 *
 * `createResilientSubscription` takes `params` as an untyped string map, so a
 * misspelled path param or a query value of the wrong type surfaces as a
 * 404/400 that the subscription then retries on a backoff — a slow, confusing
 * failure. This validates against the contract's own schemas up front and
 * throws immediately instead, and returns the parsed output so Zod defaults
 * apply. Where a parsed value has no place on the wire — a query schema that
 * coerces a string into a `Date` — the value you supplied is sent, which is
 * what `sendByApiContract` would have put on the query string too.
 *
 * Header values that change over time (a bearer token) do NOT belong here:
 * params are captured once when the subscription is created, whereas the
 * transport's own `headers` option is resolved fresh for every poll and every
 * reconnect. That is what lets `onAuthChallenge` recover an expired token.
 * Headers supplied here are checked against `requestHeaderSchema`, but only
 * the ones supplied — a header the contract requires and the transport layer
 * provides is not demanded twice.
 *
 * @example
 * ```typescript
 * const subscription = createResilientSubscription(uploadStatusBinding, {
 *   transport: createFallbackTransport(client, { contract: uploadStatusContract }),
 *   params: buildFallbackParams(uploadStatusContract, { pathParams: { uploadId } }),
 * })
 * ```
 */
export function buildFallbackParams<TContract extends ApiContract>(
  contract: TContract,
  params: FallbackContractParams<TContract>,
): FallbackRequestParams {
  const source = params as {
    pathParams?: Record<string, unknown>
    queryParams?: Record<string, unknown>
    headers?: Record<string, string>
    body?: unknown
  }

  const pathParams = validate(
    contract.requestPathParamsSchema,
    source.pathParams,
    'pathParams',
    contract,
  ) as Record<string, string | number> | undefined
  const queryParams =
    source.queryParams === undefined
      ? undefined
      : flattenQueryParams(
          validate(
            contract.requestQuerySchema,
            source.queryParams,
            'queryParams',
            contract,
          ) as Record<string, unknown>,
          source.queryParams,
          contract,
        )
  // Checked, but not replaced by the parse output: header values are strings on
  // the wire either way, and swapping in Zod's object would let its unknown-key
  // pruning silently drop a header the contract does not declare.
  validate(suppliedHeadersSchema(contract.requestHeaderSchema), source.headers, 'headers', contract)
  const body = validate(
    typeof contract.requestBodySchema === 'object' ? contract.requestBodySchema : undefined,
    source.body,
    'body',
    contract,
  )

  return {
    ...(pathParams !== undefined && { pathParams }),
    ...(queryParams !== undefined && { queryParams }),
    ...(source.headers !== undefined && { headers: source.headers }),
    ...(body !== undefined && { body }),
  }
}
