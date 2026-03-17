import type { InferSchemaInput, InferSchemaOutput, RouteContract } from '@lokalise/api-contracts'
import type { FastifyInstance } from 'fastify'
import type { Response as LightMyRequestResponse } from 'light-my-request'
import type { z } from 'zod/v4'
import type { PayloadRouteRequestParams } from './fastifyApiRequestInjector.ts'

// biome-ignore lint/suspicious/noExplicitAny: we don't care about what kind of app instance we get here
type AnyFastifyInstance = FastifyInstance<any, any, any, any>

type ExtractBodyInput<T> = T extends z.ZodType ? InferSchemaInput<T> : undefined

export async function injectByRouteContract<const Contract extends RouteContract>(
  app: AnyFastifyInstance,
  routeContract: Contract,
  params: PayloadRouteRequestParams<
    InferSchemaOutput<Contract['requestPathParamsSchema']>,
    ExtractBodyInput<Contract['requestBodySchema']>,
    InferSchemaInput<Contract['requestQuerySchema']>,
    InferSchemaInput<Contract['requestHeaderSchema']>
  >,
): Promise<LightMyRequestResponse> {
  const anyParams = params as any
  const resolvedHeaders =
    typeof anyParams.headers === 'function' ? await anyParams.headers() : anyParams.headers

  const path = routeContract.pathResolver(anyParams.pathParams)

  const injection = app
    .inject()
    [routeContract.method](path)
    .headers(resolvedHeaders)
    .query(anyParams.query)

  if (anyParams.body) {
    return injection.body(anyParams.body).end()
  }

  return injection.end()
}
