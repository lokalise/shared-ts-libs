import {
  defineRouteContract,
  type InferSuccessSchema,
  mapRouteContractToPath,
  type RouteContract,
} from '@lokalise/api-contracts'
import { copyWithoutUndefined } from '@lokalise/node-core'
import { z } from 'zod/v4'
import type { InferredOptionalSchema } from './responseTypes.ts'
import type {
  ApiContractMetadataToRouteMapper,
  ExtendedFastifySchema,
  FastifyPayloadHandlerFn,
  RouteType,
} from './types.ts'

type ExtractRequestBody<T> = T extends { requestBodySchema: z.Schema }
  ? T['requestBodySchema']
  : undefined

const buildFastifyRouteNew = <T extends RouteContract>(
  routeConfig: T,
  handler: FastifyPayloadHandlerFn<
    InferredOptionalSchema<InferSuccessSchema<T['responseSchemasByStatusCode']>>,
    InferredOptionalSchema<ExtractRequestBody<T>>,
    InferredOptionalSchema<T['requestPathParamsSchema']>,
    InferredOptionalSchema<T['requestQuerySchema']>,
    InferredOptionalSchema<T['requestHeaderSchema']>
  >,
  contractMetadataToRouteMapper: ApiContractMetadataToRouteMapper = () => ({}),
): RouteType<
  InferredOptionalSchema<InferSuccessSchema<T['responseSchemasByStatusCode']>>,
  InferredOptionalSchema<ExtractRequestBody<T>>,
  InferredOptionalSchema<T['requestPathParamsSchema']>,
  InferredOptionalSchema<T['requestQuerySchema']>,
  InferredOptionalSchema<T['requestHeaderSchema']>
> => {
  const routeMetadata = contractMetadataToRouteMapper(routeConfig.metadata)
  const mergedConfig = routeMetadata.config
    ? {
        ...routeMetadata.config,
        routeConfig,
      }
    : {
        routeConfig,
      }
  const mergedMetadata = {
    ...routeMetadata,
    config: mergedConfig,
  }

  const requestBodySchema =
    routeConfig.method === 'post' || routeConfig.method === 'put' || routeConfig.method === 'patch'
      ? routeConfig?.requestBodySchema
      : undefined

  return {
    ...mergedMetadata,
    method: routeConfig.method,
    url: mapRouteContractToPath(routeConfig),
    handler,
    schema: copyWithoutUndefined({
      body: requestBodySchema,
      params: routeConfig.requestPathParamsSchema,
      querystring: routeConfig.requestQuerySchema,
      headers: routeConfig.requestHeaderSchema,
      describe: routeConfig.description,
      description: routeConfig.description,
      summary: routeConfig.summary,
      response: routeConfig.responseSchemasByStatusCode,
    } satisfies ExtendedFastifySchema),
  } as any
}

const getContract = defineRouteContract({
  method: 'post',
  requestPathParamsSchema: z.object({
    userId: z.uuid(),
  }),
  pathResolver: ({ userId }) => `/users/${userId}`,
  requestQuerySchema: z.object({
    testQuery: z.string(),
  }),
  requestHeaderSchema: z.object({
    testHeader: z.string(),
  }),
  requestBodySchema: z.object({ val: z.number() }),
  responseSchemasByStatusCode: {
    200: z.object({ resVal: z.string() }),
  },
})

buildFastifyRouteNew(getContract, (req, reply) => {
  req.query.testQuery // typed ad string
  req.headers.testheader // typed as string
  req.body.val // typed as number

  return { resVal: '' } // requestBodySchema structure is forced here
})
