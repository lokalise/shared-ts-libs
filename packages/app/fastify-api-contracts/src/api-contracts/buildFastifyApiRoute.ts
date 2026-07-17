import type { Readable } from 'node:stream'
import {
  type ApiContract,
  getSseSchemaByEventName,
  type HttpStatusCode,
  isBlobBody,
  isContentResponseEntry,
  isJsonBody,
  isJsonResponse,
  isSseBody,
  mapApiContractToPath,
  type SseSchemaByEventName,
} from '@lokalise/api-contracts'
import { InternalError } from '@lokalise/node-core'
import type { FastifyReply, FastifyRequest, RouteOptions } from 'fastify'
import type { ApiRouteOptions, InferApiHandler } from './apiHandlerTypes.ts'
import { buildFastifyApiSchema } from './buildFastifyApiSchema.ts'
import type { SSEStreamMessage } from './sseTypes.ts'
import { buildApiSSEContext, determineResponseContentType } from './sseUtils.ts'

/**
 * SSE-capable routes are registered in `@fastify/sse` `'manual'` mode: no `Accept`-header
 * negotiation — `reply.sse` is always attached and the handler decides at runtime whether to
 * stream or return a regular `{ status, body }` response, matching this builder's handler
 * shape (and supporting clients that signal streaming via the request body rather than the
 * `Accept` header).
 */
function buildSSERouteConfig(
  options: ApiRouteOptions | undefined,
): 'manual' | { kind: 'manual'; serializer?: (data: unknown) => string; heartbeat?: boolean } {
  if (!options?.serializer && options?.heartbeat === undefined) {
    return 'manual'
  }

  const sseConfig: {
    kind: 'manual'
    serializer?: (data: unknown) => string
    heartbeat?: boolean
  } = { kind: 'manual' }

  if (options.serializer) {
    sseConfig.serializer = options.serializer
  }
  if (options.heartbeat !== undefined) {
    sseConfig.heartbeat = options.heartbeat
  }

  return sseConfig
}

/** Collects the response content-types a contract declares (a bare Zod schema is `application/json`). */
function getContractResponseContentTypes(contract: ApiContract): string[] {
  const contentTypes = new Set<string>()

  for (const entry of Object.values(contract.responsesByStatusCode)) {
    const entryContentTypes = isJsonResponse(entry)
      ? ['application/json']
      : Object.keys(entry.content ?? {})

    for (const contentType of entryContentTypes) {
      contentTypes.add(contentType)
    }
  }

  return [...contentTypes]
}

/** True when any response entry of the contract (any status code) declares an SSE body. */
export const hasAnySseResponse = (apiContract: ApiContract): boolean =>
  Object.values(apiContract.responsesByStatusCode).some(
    (value) =>
      value !== undefined &&
      isContentResponseEntry(value) &&
      Object.values(value.content ?? {}).some(isSseBody),
  )

function validateApiResponseHeaders(contract: ApiContract, reply: FastifyReply): void {
  const schema = contract.responseHeaderSchema
  if (!schema) {
    return
  }

  const result = schema.safeParse(reply.getHeaders())
  if (!result.success) {
    throw new InternalError({
      message: 'Internal Server Error',
      errorCode: 'RESPONSE_HEADERS_VALIDATION_FAILED',
      details: { validationError: result.error.message },
    })
  }
}

type StatusBody = { status: number; contentType?: string; body: unknown }

function isStatusBodyResult(value: unknown): value is StatusBody {
  return typeof value === 'object' && value !== null && 'status' in value
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return typeof value === 'object' && value !== null && Symbol.asyncIterator in value
}

// Streams are detected by duck-typing (`pipe`), mirroring Fastify's own stream detection —
// cross-realm safe, unlike `instanceof Readable`.
function isStream(value: unknown): value is Readable {
  return (
    typeof value === 'object' &&
    value !== null &&
    'pipe' in value &&
    typeof value.pipe === 'function'
  )
}

/**
 * True when the contract declares `contentType` at this status as an `sseBody()` descriptor.
 */
function isDeclaredSseContentType(
  contract: ApiContract,
  status: number,
  contentType: string,
): boolean {
  const entry = contract.responsesByStatusCode[status as HttpStatusCode]
  if (!entry || isJsonResponse(entry)) {
    return false
  }
  const descriptor = entry.content?.[contentType]
  return descriptor !== undefined && isSseBody(descriptor)
}

/**
 * Look up the `content-type` the contract declares for the response the handler returned —
 * the fallback used when the handler didn't return an explicit `contentType`.
 *
 * The status code selects the entry; the body kind selects the matching media type within a
 * content-map entry — needed for content maps mixing JSON with a blob at one status, where the
 * declaration alone can't tell which representation the handler chose. A raw body (`string`/
 * `Buffer`/`Readable`) matches a `blobBody()` descriptor and uses its media-type key; any other
 * body matches a JSON schema. Returns `undefined` when nothing matches.
 */
function getDeclaredContentType(
  contract: ApiContract,
  status: number,
  body: unknown,
): string | undefined {
  const entry = contract.responsesByStatusCode[status as HttpStatusCode]
  if (!entry) {
    return undefined
  }

  const isRawBody = typeof body === 'string' || Buffer.isBuffer(body) || isStream(body)

  if (isJsonResponse(entry)) {
    return isRawBody ? undefined : 'application/json'
  }

  for (const [mediaType, descriptor] of Object.entries(entry.content ?? {})) {
    if (isRawBody ? isBlobBody(descriptor) : isJsonBody(descriptor)) {
      return mediaType
    }
  }
  return undefined
}

/**
 * Send a `{ status, contentType?, body }` HTTP response, shared by the non-SSE path and the
 * non-streaming branch of an SSE-capable handler.
 *
 * The body is passed to Fastify as-is — a `string`, `Buffer` or `Readable` stream is sent
 * natively, everything else is serialized as JSON. The `content-type` (unless the handler
 * already set one via `reply`) is the explicit `contentType` from the handler result when
 * present — required when a status declares several media types, and what lets Fastify pick
 * the matching per-media-type response schema — otherwise it falls back to the body kind:
 * a raw body uses the contract's declared `blobBody()` media type, everything else is
 * `application/json`.
 */
async function sendResponse(
  contract: ApiContract,
  reply: FastifyReply,
  { status, contentType, body }: StatusBody,
): Promise<void> {
  // Set the content-type when the handler hasn't set one. (@fastify/sse commits its
  // `text/event-stream` headers lazily on stream start, so nothing is pre-set here on the
  // non-streaming path of an SSE-capable route.)
  if (reply.getHeader('content-type') === undefined) {
    const resolvedContentType = contentType ?? getDeclaredContentType(contract, status, body)

    if (resolvedContentType) {
      reply.type(resolvedContentType)
    }
  }

  // Response body validation is handled by the `fastify-type-provider-zod` serializer
  // compiler (a required dependency), which throws a 500 when a JSON body doesn't match the
  // contract's schema for this status code and content-type (raw and SSE bodies bypass the
  // serializer). Response headers are not covered by the serializer, so they are validated
  // explicitly here.
  validateApiResponseHeaders(contract, reply)

  if (reply.sent) {
    return
  }

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
    ? buildApiSSEContext(request, reply, eventSchemas, options)
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

  if (isStatusBodyResult(result)) {
    // An SSE response carries an async iterable of events as its body: open the connection
    // and pipe each event (validated against the contract's event schemas). An explicit
    // `contentType` on the result settles which representation the handler chose — needed
    // when a status mixes SSE with another async-iterable-looking body (e.g. a `Readable`
    // blob); without one, an async-iterable body means SSE.
    const streamsSse =
      isAsyncIterable(result.body) &&
      (result.contentType === undefined ||
        isDeclaredSseContentType(contract, result.status, result.contentType))
    if (apiSSEContext && streamsSse) {
      const session = apiSSEContext.sseContext.start('autoClose')
      await session.sendStream(result.body as AsyncIterable<SSEStreamMessage>)
      apiSSEContext.markHandlerDone()
      return
    }
    // Any other status/body is sent as a regular HTTP response.
    await sendResponse(contract, reply, result)
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
 * declared response content-types. For contracts with any SSE response the context is
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

  return {
    ...fastifyOptions,
    ...contractMetadata,
    method: contract.method,
    url: mapApiContractToPath(contract),
    // `sse` is only set for SSE-capable contracts; non-SSE routes must not carry it.
    ...(sseCapable ? { sse: buildSSERouteConfig(options) } : {}),
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
