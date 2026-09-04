import type { ApiContract, InferSchemaInput } from '@lokalise/api-contracts'
import type { z } from 'zod/v4'
import { FallbackParamsValidationError, FallbackUnsupportedParamError } from './errors.ts'
import type { FallbackRequestParams } from './types.ts'

type Prettify<T> = { [K in keyof T]: T[K] } & {}

type RequiredWhenDefined<T, TKey extends string> = [T] extends [undefined]
  ? { [K in TKey]?: undefined }
  : { [K in TKey]: T }

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
    RequiredWhenDefined<InferSchemaInput<TContract['requestHeaderSchema']>, 'headers'>
>

function validate(
  schema: z.ZodType | undefined,
  value: unknown,
  part: 'pathParams' | 'queryParams' | 'body',
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

/**
 * A fallback binding's request shape carries query parameters as
 * `Record<string, string>`, so a repeated key (`?tag=a&tag=b`) has nowhere to
 * live. Rejecting the value beats silently sending `tag=a%2Cb`, which the
 * server would read as one tag named `a,b`.
 */
function flattenQueryParams(
  queryParams: Record<string, unknown>,
  contract: ApiContract,
): Record<string, string | number | boolean> {
  const flattened: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(queryParams)) {
    if (value === undefined || value === null) continue
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      flattened[key] = value
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
 * Build the params a fallback subscription is created with, typed and
 * validated against the contract.
 *
 * `createResilientSubscription` takes `params` as an untyped string map, so a
 * misspelled path param or a query value of the wrong type surfaces as a
 * 404/400 that the subscription then retries on a backoff — a slow, confusing
 * failure. This validates against the contract's own schemas up front and
 * throws immediately instead, and returns the parsed output so Zod defaults
 * and coercions apply exactly as they do for `sendByApiContract`.
 *
 * Header values that change over time (a bearer token) do NOT belong here:
 * params are captured once when the subscription is created, whereas the
 * transport's own `headers` option is resolved fresh for every poll and every
 * reconnect. That is what lets `onAuthChallenge` recover an expired token.
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
  const queryParams = validate(
    contract.requestQuerySchema,
    source.queryParams,
    'queryParams',
    contract,
  ) as Record<string, unknown> | undefined
  const body = validate(
    typeof contract.requestBodySchema === 'object' ? contract.requestBodySchema : undefined,
    source.body,
    'body',
    contract,
  )

  return {
    ...(pathParams !== undefined && { pathParams }),
    ...(queryParams !== undefined && { queryParams: flattenQueryParams(queryParams, contract) }),
    ...(source.headers !== undefined && { headers: source.headers }),
    ...(body !== undefined && { body }),
  }
}
