import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { getApiSseRuntime } from './sseUtils.ts'

/**
 * An error resolved to the response to send. `payload` is the transport-independent error
 * document; `statusCode` and `headers` are the HTTP envelope, applied when
 * the transport still has one — a live SSE stream does not (its status line and headers
 * went out on start), so there only the `payload` is delivered, as the data of the
 * terminal `error` event.
 */
export type ApiErrorResponse = {
  statusCode: number
  payload: unknown
  headers?: Record<string, string>
}

/**
 * Maps an error thrown by a contract route (handler, hooks, or request validation) to the
 * response to send, and is the place to report it. For a regular response the result drives
 * `reply.headers(headers).status(statusCode).send(payload)`; when an SSE stream is already
 * live only `payload` is used — it becomes the data of a terminal `error` event before the
 * stream is closed (neither a status code nor headers can be sent on committed headers).
 */
export type ResolveApiErrorResponse = (
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
) => ApiErrorResponse | Promise<ApiErrorResponse>

/** `FastifyInstance` decoration key holding the app-wide contract error resolver. */
export const apiContractsErrorResolverKey = Symbol.for(
  '@lokalise/fastify-api-contracts/resolveErrorResponse',
)

declare module 'fastify' {
  interface FastifyInstance {
    [apiContractsErrorResolverKey]?: ResolveApiErrorResponse
  }
}

export type FastifyApiContractsOptions = {
  resolveErrorResponse: ResolveApiErrorResponse
}

/**
 * Registers an app-wide error resolver for every contract route built with
 * `buildFastifyApiRoute` — the single place to serialize (and report) errors for all
 * contract endpoints. A route-level `resolveErrorResponse` option overrides it per route.
 */
export const fastifyApiContracts = fp<FastifyApiContractsOptions>(
  (app: FastifyInstance, options, done) => {
    app.decorate(apiContractsErrorResolverKey, options.resolveErrorResponse)
    done()
  },
  { name: '@lokalise/fastify-api-contracts', fastify: '5.x' },
)

/**
 * Build the route `errorHandler` attached to every contract route — the single place every
 * route error lands: request validation, hooks, and handler errors, including rejections
 * with a live SSE stream (the route runtime keeps the plugin-level keep-alive on, so
 * `@fastify/sse` never closes the stream before Fastify invokes this handler).
 *
 * The decision table:
 * - **Resolver configured** (route option → `fastifyApiContracts` plugin): a regular
 *   response is `reply.headers(headers).status(statusCode).send(payload)`; a live SSE
 *   stream — where a status line and headers can no longer be sent — gets the `payload` as
 *   the data of a terminal `error` event instead, and is closed.
 * - **No resolver**: the app's error handler (`fastify.errorHandler` — whatever
 *   `setErrorHandler` configured, or Fastify's default) is invoked, so plain contract
 *   routes behave exactly like any other route and reporting side effects always run. On a
 *   live stream an SSE-aware app handler can emit its own terminal event, a non-aware one
 *   cannot send on the committed stream — the stream is closed either way (nothing else
 *   closes it).
 */
export function buildApiRouteErrorHandler(routeResolver: ResolveApiErrorResponse | undefined) {
  return async function apiRouteErrorHandler(
    error: FastifyError,
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const configuredResolver = routeResolver ?? request.server[apiContractsErrorResolverKey]
    const sse = getApiSseRuntime(reply)

    if (!configuredResolver) {
      try {
        return await request.server.errorHandler(error, request, reply)
      } finally {
        if (sse?.isConnected()) {
          sse.close()
        }
      }
    }

    const { statusCode, payload, headers } = await configuredResolver(error, request, reply)

    if (sse?.isConnected()) {
      try {
        await sse.sendErrorEvent(payload)
      } finally {
        sse.close()
      }
      return
    }

    if (headers) {
      reply.headers(headers)
    }
    await reply.status(statusCode).send(payload)
  }
}
