import {
  type ApiContract,
  type ApiContractResponse,
  ContractNoBody,
  type DeleteApiContract,
  type GetApiContract,
  type InferNonSseSuccessResponses,
  type InferSchemaOutput,
  isAnyOfResponses,
  isJsonResponse,
  mapApiContractToPath,
  type PayloadApiContract,
  type ResponsesByStatusCode,
} from '@lokalise/api-contracts'
import { copyWithoutUndefined } from '@lokalise/node-core'
import { z } from 'zod/v4'
import type {
  ApiContractMetadataToRouteMapper,
  ExtendedFastifySchema,
  FastifyNoPayloadHandlerFn,
  FastifyPayloadHandlerFn,
  RouteType,
} from './types.ts'

/**
 * The reply body the handler is allowed to return — the union of all non-SSE success response
 * bodies declared by the contract (JSON / text / blob; `ContractNoBody` resolves to `undefined`).
 */
type ContractReplyType<TApiContract extends ApiContract> = InferNonSseSuccessResponses<
  TApiContract['responsesByStatusCode']
>

/**
 * The request body schema, or `undefined` when the contract has none (GET/DELETE) or declares
 * `ContractNoBody`.
 */
type ContractRequestBodySchema<TApiContract extends ApiContract> = TApiContract extends {
  requestBodySchema: z.ZodType
}
  ? TApiContract['requestBodySchema']
  : undefined

type ContractBodyType<TApiContract extends ApiContract> = InferSchemaOutput<
  ContractRequestBodySchema<TApiContract>
>

// Each request schema is extracted with a `T extends { key: z.ZodType }` guard rather than a direct
// index access: when the contract omits an optional schema entirely, indexing the inferred literal
// resolves to `never` (instead of `undefined`), which would make the route handler reject Fastify's
// `any`-typed request and break assignability to `RouteType`. The guard defaults absent schemas to
// `undefined`, matching the behavior of the legacy `buildFastifyRoute`.
type ContractParamsType<TApiContract extends ApiContract> = TApiContract extends {
  requestPathParamsSchema: z.ZodType
}
  ? InferSchemaOutput<TApiContract['requestPathParamsSchema']>
  : undefined
type ContractQueryType<TApiContract extends ApiContract> = TApiContract extends {
  requestQuerySchema: z.ZodType
}
  ? InferSchemaOutput<TApiContract['requestQuerySchema']>
  : undefined
type ContractHeadersType<TApiContract extends ApiContract> = TApiContract extends {
  requestHeaderSchema: z.ZodType
}
  ? InferSchemaOutput<TApiContract['requestHeaderSchema']>
  : undefined

/** Handler for a GET/DELETE contract — no `req.body`. */
type NoPayloadContractHandler<TApiContract extends ApiContract> = FastifyNoPayloadHandlerFn<
  ContractReplyType<TApiContract>,
  ContractParamsType<TApiContract>,
  ContractQueryType<TApiContract>,
  ContractHeadersType<TApiContract>
>

/** Handler for a POST/PUT/PATCH contract — with `req.body`. */
type PayloadContractHandler<TApiContract extends ApiContract> = FastifyPayloadHandlerFn<
  ContractReplyType<TApiContract>,
  ContractBodyType<TApiContract>,
  ContractParamsType<TApiContract>,
  ContractQueryType<TApiContract>,
  ContractHeadersType<TApiContract>
>

/** Route definition for a GET/DELETE contract — never carries a body type. */
type NoPayloadContractRoute<TApiContract extends ApiContract> = RouteType<
  ContractReplyType<TApiContract>,
  undefined,
  ContractParamsType<TApiContract>,
  ContractQueryType<TApiContract>,
  ContractHeadersType<TApiContract>
>

/** Route definition for a POST/PUT/PATCH contract. */
type PayloadContractRoute<TApiContract extends ApiContract> = RouteType<
  ContractReplyType<TApiContract>,
  ContractBodyType<TApiContract>,
  ContractParamsType<TApiContract>,
  ContractQueryType<TApiContract>,
  ContractHeadersType<TApiContract>
>

/**
 * Extracts the Fastify-compatible (JSON, Zod) response schema for a single contract entry.
 *
 * Non-JSON responses (`ContractNoBody`, `noBodyResponse`, `textResponse`, `blobResponse`,
 * `sseResponse`) have no Zod serializer schema and resolve to `undefined`. For `anyOfResponses`,
 * the JSON members are collected and unioned (text/blob/SSE members are dropped).
 */
function extractFastifyResponseSchema(entry: ApiContractResponse): z.ZodType | undefined {
  if (isAnyOfResponses(entry)) {
    const jsonSchemas = entry.responses.filter(isJsonResponse)

    if (jsonSchemas.length === 0) {
      return undefined
    }
    if (jsonSchemas.length === 1) {
      return jsonSchemas[0]
    }
    return z.union(jsonSchemas as [z.ZodType, z.ZodType, ...z.ZodType[]])
  }

  // `isJsonResponse` is true only for a plain Zod schema; `ContractNoBody`, `noBodyResponse`,
  // `textResponse`, `blobResponse` and `sseResponse` entries all resolve to `false`.
  return isJsonResponse(entry) ? entry : undefined
}

/**
 * Maps a contract's `responsesByStatusCode` into the `{ [statusCode]: ZodSchema }` shape Fastify's
 * Zod serializer expects, keeping only entries that carry a JSON body. Returns `undefined` when no
 * status code has a serializable schema, so the route omits `schema.response` entirely.
 */
function mapResponsesByStatusCodeToFastifyResponseSchema(
  responsesByStatusCode: ResponsesByStatusCode,
): Record<string, z.ZodType> | undefined {
  const response: Record<string, z.ZodType> = {}

  for (const [statusCode, entry] of Object.entries(responsesByStatusCode)) {
    if (entry === undefined) {
      continue
    }

    const schema = extractFastifyResponseSchema(entry)
    if (schema !== undefined) {
      response[statusCode] = schema
    }
  }

  return Object.keys(response).length > 0 ? response : undefined
}

/**
 * Infers the handler request/reply types directly from a contract created with `defineApiContract`
 * (the current `@lokalise/api-contracts` API). Use it to define a handler separately from the route.
 *
 * The handler shape is determined automatically from the contract:
 * - GET/DELETE contracts → handler without `req.body`
 * - POST/PUT/PATCH contracts → handler with `req.body` (typed `undefined` for `ContractNoBody`)
 *
 * This is the `defineApiContract` counterpart of {@link buildFastifyRouteHandler}, which targets the
 * deprecated `buildRestContract`/`buildGetRoute`/`buildPayloadRoute` route definitions.
 */

// Overload: GET route handler
export function buildFastifyApiRouteHandler<const TApiContract extends GetApiContract>(
  apiContract: TApiContract,
  handler: NoPayloadContractHandler<TApiContract>,
): NoPayloadContractHandler<TApiContract>

// Overload: DELETE route handler
export function buildFastifyApiRouteHandler<const TApiContract extends DeleteApiContract>(
  apiContract: TApiContract,
  handler: NoPayloadContractHandler<TApiContract>,
): NoPayloadContractHandler<TApiContract>

// Overload: payload (POST/PUT/PATCH) route handler
export function buildFastifyApiRouteHandler<const TApiContract extends PayloadApiContract>(
  apiContract: TApiContract,
  handler: PayloadContractHandler<TApiContract>,
): PayloadContractHandler<TApiContract>

// Implementation
export function buildFastifyApiRouteHandler(
  _apiContract: ApiContract,
  // biome-ignore lint/suspicious/noExplicitAny: handler type depends on the overload
  handler: any,
  // biome-ignore lint/suspicious/noExplicitAny: return type depends on the overload
): any {
  return handler
}

/**
 * Builds a complete Fastify route definition from a contract created with `defineApiContract` (the
 * current `@lokalise/api-contracts` API). The HTTP method, URL, request schemas and response schema
 * are all derived from the contract, and the handler request/reply types are inferred from it:
 * - GET/DELETE contracts → handler without `req.body`
 * - POST/PUT/PATCH contracts → handler with `req.body` (typed `undefined` for `ContractNoBody`)
 *
 * This is the `defineApiContract` counterpart of {@link buildFastifyRoute}, which targets the
 * deprecated `buildRestContract`/`buildGetRoute`/`buildPayloadRoute` route definitions.
 *
 * Only response entries that carry a JSON body contribute to `schema.response`; `ContractNoBody`,
 * `textResponse`, `blobResponse` and `sseResponse` entries are skipped, since they have no Zod
 * serializer schema. `anyOfResponses` entries contribute the union of their JSON members.
 *
 * The contract is exposed at runtime on the route config as `apiContract`, so it can be read from
 * lifecycle hooks and handlers via `req.routeOptions.config.apiContract`.
 *
 * @param apiContract - The contract created with `defineApiContract`.
 * @param handler - The route handler, typed from the contract.
 * @param contractMetadataToRouteMapper - Optional callback mapping the contract metadata to extra
 *   Fastify route options (e.g. `config`, `preHandler`).
 */

// Overload: GET route
export function buildFastifyApiRoute<const TApiContract extends GetApiContract>(
  apiContract: TApiContract,
  handler: NoPayloadContractHandler<TApiContract>,
  contractMetadataToRouteMapper?: ApiContractMetadataToRouteMapper,
): NoPayloadContractRoute<TApiContract>

// Overload: DELETE route
export function buildFastifyApiRoute<const TApiContract extends DeleteApiContract>(
  apiContract: TApiContract,
  handler: NoPayloadContractHandler<TApiContract>,
  contractMetadataToRouteMapper?: ApiContractMetadataToRouteMapper,
): NoPayloadContractRoute<TApiContract>

// Overload: payload route (POST/PUT/PATCH)
export function buildFastifyApiRoute<const TApiContract extends PayloadApiContract>(
  apiContract: TApiContract,
  handler: PayloadContractHandler<TApiContract>,
  contractMetadataToRouteMapper?: ApiContractMetadataToRouteMapper,
): PayloadContractRoute<TApiContract>

// Implementation
export function buildFastifyApiRoute(
  apiContract: ApiContract,
  // biome-ignore lint/suspicious/noExplicitAny: handler type depends on the overload
  handler: any,
  contractMetadataToRouteMapper: ApiContractMetadataToRouteMapper = () => ({}),
  // biome-ignore lint/suspicious/noExplicitAny: return type depends on the overload
): any {
  const routeMetadata = contractMetadataToRouteMapper(apiContract.metadata)
  const mergedConfig = routeMetadata.config
    ? {
        ...routeMetadata.config,
        apiContract,
      }
    : {
        apiContract,
      }

  const requestBodySchema = apiContract.requestBodySchema
  const schema = copyWithoutUndefined({
    body: requestBodySchema === ContractNoBody ? undefined : requestBodySchema,
    params: apiContract.requestPathParamsSchema,
    querystring: apiContract.requestQuerySchema,
    headers: apiContract.requestHeaderSchema,
    describe: apiContract.description,
    description: apiContract.description,
    summary: apiContract.summary,
    tags: apiContract.tags,
    response: mapResponsesByStatusCodeToFastifyResponseSchema(apiContract.responsesByStatusCode),
  } satisfies ExtendedFastifySchema)

  return {
    ...routeMetadata,
    config: mergedConfig,
    method: apiContract.method,
    url: mapApiContractToPath(apiContract),
    handler,
    schema,
  }
}
