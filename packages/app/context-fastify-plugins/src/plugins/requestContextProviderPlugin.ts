import { randomUUID } from 'node:crypto'
import { requestContext } from '@fastify/request-context'
import type { CommonLogger } from '@lokalise/node-core'
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  FastifyServerOptions,
  HookHandlerDoneFunction,
} from 'fastify'
import fp from 'fastify-plugin'

export const REQUEST_ID_STORE_KEY = 'request_id'

// Augment existing FastifyRequest interface with new fields
declare module 'fastify' {
  interface FastifyRequest {
    // biome-ignore lint/correctness/noUndeclaredVariables: <explanation>
    reqContext: RequestContext
  }
}

export interface BaseRequestContext {
  logger: CommonLogger
  reqId: string
}

// Add new interface to the fastify module
declare module 'fastify' {
  interface RequestContext extends BaseRequestContext {}
}

declare module '@fastify/request-context' {
  interface RequestContextData {
    [REQUEST_ID_STORE_KEY]: string
  }
}

export function getRequestIdFastifyAppConfig(): Pick<
  FastifyServerOptions,
  'genReqId' | 'requestIdHeader'
> {
  return {
    genReqId: () => randomUUID(),
    requestIdHeader: 'x-request-id',
  }
}

function plugin(fastify: FastifyInstance, _opts: unknown, done: () => void) {
  fastify.addHook(
    'onRequest',
    function onRequestContextProvider(
      req: FastifyRequest,
      _res: FastifyReply,
      next: HookHandlerDoneFunction,
    ) {
      req.reqContext = {
        logger: (req.log as CommonLogger).child({
          'x-request-id': req.id,
        }),
        reqId: req.id,
      }

      // Store request_id in AsyncLocalStorage to be picked up by instrumentation tooling, such as OpenTelemetry
      requestContext.set(REQUEST_ID_STORE_KEY, req.id)

      next()
    },
  )

  fastify.addHook(
    'onSend',
    (req: FastifyRequest, res: FastifyReply, _payload, next: HookHandlerDoneFunction) => {
      void res.header('x-request-id', req.id)
      next()
    },
  )

  done()
}

export const requestContextProviderPlugin = fp(plugin, {
  fastify: '>=4.0.0',
  name: 'request-context-provider-plugin',
})
