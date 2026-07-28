import type { SSERouteOptions } from '@fastify/sse'
import {
  type ApiContract,
  getSseSchemaByEventName,
  type HttpStatusCode,
  isContentResponseEntry,
  isJsonResponse,
  isSseBody,
  mapApiContractToPath,
  type SseSchemaByEventName,
} from '@lokalise/api-contracts'
import type { FastifyReply, FastifyRequest, RouteOptions } from 'fastify'
import type { ApiRouteOptions, InferApiHandler } from './apiHandlerTypes.ts'
import { buildFastifyApiSchema } from './buildFastifyApiSchema.ts'
import type { SSEStreamMessage } from './sseTypes.ts'
import {
  buildApiSSEContext,
  determineResponseContentType,
  validateApiResponseHeaders,
} from './sseUtils.ts'

/**
 * SSE-capable routes are registered in `@fastify/sse` `'manual'` mode: no `Accept`-header
 * negotiation — `reply.sse` is always attached and the handler decides at runtime whether to
 * stream or return a regular `{ status, body }` response, matching this builder's handler
 * shape (and supporting clients that signal streaming via the request body rather than the
 * `Accept` header).
 */
function buildSSERouteOptions(options?: ApiRouteOptions): SSERouteOptions {
  const sseOptions: SSERouteOptions = { kind: 'manual' }

  if (options?.serializer) {
    sseOptions.serializer = options.serializer
  }
  if (options?.heartbeat !== undefined) {
    sseOptions.heartbeat = options.heartbeat
  }

  return sseOptions
}

/** Collects the response content-types a contract declares (a bare Zod schema is `application/json`). */
function getContractResponseContentTypes(contract: ApiContract): string[] {
  const contentTypes = new Set<string>()

  for (const entry of Object.values(contract.responsesByStatusCode)) {
    if (isJsonResponse(entry)) {
      contentTypes.add('application/json')

      continue
    }

    if (!entry.content) {
      continue
    }

    for (const contentType of Object.keys(entry.content)) {
      contentTypes.add(contentType)
    }
  }

  return [...contentTypes]
}

/** True when any response entry of the contract (any status code) declares an SSE body. */
export const hasAnySseResponse = (apiContract: ApiContract): boolean =>
  Object.values(apiContract.responsesByStatusCode).some(
    (value) =>
      isContentResponseEntry(value) &&
      value.content &&
      Object.values(value.content).some(isSseBody),
  )

/** The runtime shape of a handler's return value (`InferApiHandlerResult` erased of its generics). */
type ApiHandlerResult = { status: number; contentType?: string; body: unknown }

function isApiHandlerResult(value: unknown): value is ApiHandlerResult {
  return typeof value === 'object' && value !== null && 'status' in value
}

/** A handler result resolved against the contract, ready to be sent. */
type ResolvedApiResponse = {
  status: number
  /** Effective response content-type; `null` for a body-less response. */
  contentType: string | null
  body: unknown
  /** True when the selected representation is an SSE stream. */
  isSse: boolean
}

/**
 * Resolve which representation a handler result selects on the contract: the effective
 * response content-type and whether it is an SSE stream.
 *
 * An explicit `result.contentType` picks the representation directly — handlers must
 * provide it when a status declares several media types. When omitted, the result must be
 * unambiguous: a `body: null` on an `allowNoBody` entry, a bare Zod schema
 * (`application/json`), or a content map's first declared content-type.
 */
function resolveResponseRepresentation(
  contract: ApiContract,
  { status, contentType, body }: ApiHandlerResult,
): ResolvedApiResponse {
  const entry = contract.responsesByStatusCode[status as HttpStatusCode]
  if (!entry) {
    throw new Error(`Contract does not declare a response for status ${status}.`)
  }

  if (contentType !== undefined) {
    const descriptor = isContentResponseEntry(entry) ? entry.content?.[contentType] : undefined
    if (descriptor === undefined) {
      throw new Error(
        `Contract does not declare content-type "${contentType}" for status ${status}.`,
      )
    }
    return { status, body, contentType, isSse: isSseBody(descriptor) }
  }

  if (isJsonResponse(entry)) {
    return { status, body, contentType: 'application/json', isSse: false }
  }

  if (entry.allowNoBody && body === null) {
    return { status, body, contentType: null, isSse: false }
  }

  const descriptorEntry = Object.entries(entry.content ?? {})[0]
  if (descriptorEntry === undefined) {
    throw new Error(`Contract does not declare a content-type for status ${status}.`)
  }
  return { status, body, contentType: descriptorEntry[0], isSse: isSseBody(descriptorEntry[1]) }
}

/**
 * Send a `{ status, contentType?, body }` HTTP response, shared by the non-SSE path and the
 * non-streaming branch of an SSE-capable handler.
 *
 * The body is passed to Fastify as-is — a `string`, `Buffer` or `Readable` stream is sent
 * natively, everything else is serialized as JSON. The resolved `contentType` is set on the
 * reply — it is what lets Fastify pick the matching per-media-type response schema — unless
 * the handler already set one via `reply`.
 */
async function sendResponse(
  contract: ApiContract,
  reply: FastifyReply,
  { status, contentType, body }: ResolvedApiResponse,
): Promise<void> {
  // A hijacked reply already went out — there is nothing left to send, and throwing here
  // (e.g. from header validation) would only make Fastify's error handler try to send again.
  if (reply.sent) {
    return
  }

  // (@fastify/sse commits its `text/event-stream` headers lazily on stream start, so nothing
  // is pre-set here on the non-streaming path of an SSE-capable route.)
  if (contentType !== null && reply.getHeader('content-type') === undefined) {
    reply.type(contentType)
  }

  // Response body validation is handled by the `fastify-type-provider-zod` serializer
  // compiler (a required dependency), which throws a 500 when a JSON body doesn't match the
  // contract's schema for this status code and content-type (raw and SSE bodies bypass the
  // serializer). Response headers are not covered by the serializer, so they are validated
  // explicitly here.
  validateApiResponseHeaders(contract.responseHeaderSchema, reply)

  await reply.code(status).send(body)
}

type HandleApiRouteParams = {
  contract: ApiContract
  // biome-ignore lint/suspicious/noExplicitAny: Handler types are validated by InferApiHandler at call site
  handler: (request: FastifyRequest, reply: FastifyReply, context: any) => any
  eventSchemas: SseSchemaByEventName
  responseContentTypes: string[]
  options: ApiRouteOptions | undefined
  sseCapable: boolean
  request: FastifyRequest
  reply: FastifyReply
}

async function handleApiRoute({
  contract,
  handler,
  eventSchemas,
  responseContentTypes,
  options,
  sseCapable,
  request,
  reply,
}: HandleApiRouteParams): Promise<void> {
  const apiSSEContext = sseCapable
    ? buildApiSSEContext(request, reply, eventSchemas, options, contract.responseHeaderSchema)
    : undefined

  const context = {
    expectedContentType: determineResponseContentType(request, responseContentTypes),
    ...(apiSSEContext ? { sse: apiSSEContext.sseContext } : {}),
  }

  const result = await handler(request, reply, context)

  if (apiSSEContext?.isStarted()) {
    // The handler drove the session imperatively via sse.start(); @fastify/sse manages
    // the rest of the connection lifecycle.
    apiSSEContext.markHandlerDone()
    return
  }

  if (isApiHandlerResult(result)) {
    const resolved = resolveResponseRepresentation(contract, result)

    // An SSE representation carries an async iterable of events as its body: open the
    // connection and pipe each event (validated against the contract's event schemas).
    if (apiSSEContext && resolved.isSse) {
      const session = apiSSEContext.sseContext.start('autoClose')
      await session.sendStream(resolved.body as AsyncIterable<SSEStreamMessage>)
      apiSSEContext.markHandlerDone()
      return
    }
    // Any other status/body is sent as a regular HTTP response.
    await sendResponse(contract, reply, resolved)
    return
  }

  throw new Error(
    'Handler must return { status, body } or call sse.start(). Handler returned without doing either.',
  )
}

/**
 * Build a Fastify `RouteOptions` object from an `ApiContract` + handler.
 *
 * The handler is `(request, reply, context) => { status, body }`. The `context` always
 * provides `expectedContentType` — the `Accept`-negotiated preference among the contract's
 * declared response content-types (across all status codes, error responses included —
 * see {@link ApiHandlerContext}). For contracts with any SSE response the context is
 * extended with `context.sse`, and the single handler runs shared logic once and then
 * either returns a non-SSE `{ status, body }` response or calls `context.sse.start(...)`
 * to stream (returning nothing).
 *
 * When a status declares several media types, the result also carries a required
 * `contentType` naming the chosen representation: `{ status, contentType, body }`.
 *
 * The optional `options` argument carries:
 * - any Fastify route field (`preHandler`, `onRequest`, `config`, `bodyLimit`, …)
 *   minus the ones the contract provides (`method`, `url`, `schema`, `handler`, `sse`),
 * - SSE lifecycle hooks (`onConnect`, `onClose`, `onReconnect`, `serializer`, `heartbeat`)
 *   — applied only for contracts that declare an SSE response.
 *
 * Options returned by `contractMetadataToRouteMapper` are a base layer: explicitly passed
 * options override them, except `config` objects, which are merged (explicit keys win).
 * The contract is always exposed as `config.apiContract`, reachable in hooks and handlers
 * via `req.routeOptions.config.apiContract`.
 *
 * @returns Fastify `RouteOptions` ready to pass to `app.route()`
 */
export function buildFastifyApiRoute<Contract extends ApiContract>(
  contract: Contract,
  apiHandler: InferApiHandler<Contract>,
  options?: ApiRouteOptions,
): RouteOptions {
  // Separate SSE-specific options (not part of Fastify RouteOptions) from the
  // passthrough options spread directly onto the route.
  const {
    contractMetadataToRouteMapper,
    serializer: _serializer,
    heartbeat: _heartbeat,
    onConnect: _onConnect,
    onClose: _onClose,
    onReconnect: _onReconnect,
    ...fastifyOptions
  } = options ?? {}

  const eventSchemas = getSseSchemaByEventName(contract) ?? {}
  const responseContentTypes = getContractResponseContentTypes(contract)
  const contractMetadata = contractMetadataToRouteMapper?.(contract.metadata) ?? {}
  const sseCapable = hasAnySseResponse(contract)

  // Mapper output is the base layer — explicitly passed options override it — except the
  // `config` objects, which are merged key-by-key (explicit keys win). The contract itself
  // is always exposed as `config.apiContract` for hooks and handlers.
  const config = {
    ...contractMetadata.config,
    ...fastifyOptions.config,
    apiContract: contract,
  }

  return {
    ...contractMetadata,
    ...fastifyOptions,
    config,
    method: contract.method,
    url: mapApiContractToPath(contract),
    // `sse` is only set for SSE-capable contracts; non-SSE routes must not carry it.
    ...(sseCapable ? { sse: buildSSERouteOptions(options) } : {}),
    schema: buildFastifyApiSchema(contract),
    handler: async (request, reply) =>
      handleApiRoute({
        contract,
        // biome-ignore lint/suspicious/noExplicitAny: Handler types are validated by InferApiHandler at call site
        handler: apiHandler as any,
        eventSchemas,
        responseContentTypes,
        options,
        sseCapable,
        request,
        reply,
      }),
  }
}
