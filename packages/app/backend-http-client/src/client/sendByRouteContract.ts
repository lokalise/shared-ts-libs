import type { Readable } from 'node:stream'
import {
  buildRequestPath,
  type GetRouteContract,
  getIsEmptyResponseExpected,
  getSuccessResponseSchema,
  type InferNonSseSuccessResponses,
  type InferSchemaInput,
  type IsNoBodySuccessResponse,
  type RouteContract,
} from '@lokalise/api-contracts'
import type { Client } from 'undici'
import { z } from 'zod/v4'
import type { PayloadRouteRequestParams } from './apiContractTypes.ts'
import type { DEFAULT_OPTIONS } from './constants.ts'
import { sendGetWithStreamedResponse, sendNonPayload, sendResourceChange } from './httpClient.ts'
import type {
  ContractRequestOptions,
  RequestOptions,
  RequestResultDefinitiveEither,
} from './types.ts'

type DEFAULT_THROW_ON_ERROR = typeof DEFAULT_OPTIONS.throwOnError

type ExtractRequestBody<T> = T extends { requestBodySchema: z.ZodType }
  ? T['requestBodySchema']
  : undefined

export function sendByRouteContract<
  const Contract extends RouteContract,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
>(
  client: Client,
  routeContract: Contract,
  params: PayloadRouteRequestParams<
    InferSchemaInput<Contract['requestPathParamsSchema']>,
    InferSchemaInput<ExtractRequestBody<Contract>>,
    InferSchemaInput<Contract['requestQuerySchema']>,
    InferSchemaInput<Contract['requestHeaderSchema']>
  >,
  options: ContractRequestOptions<
    IsNoBodySuccessResponse<Contract['responseSchemasByStatusCode']>,
    DoThrowOnError
  >,
): Promise<
  RequestResultDefinitiveEither<
    InferNonSseSuccessResponses<Contract['responseSchemasByStatusCode']>,
    IsNoBodySuccessResponse<Contract['responseSchemasByStatusCode']>,
    DoThrowOnError
  >
> {
  // biome-ignore lint/suspicious/noExplicitAny: pathParams key may not be present in params
  const path = buildRequestPath(
    routeContract.pathResolver((params as any).pathParams),
    params.pathPrefix,
  )
  const responseSchema = getSuccessResponseSchema(routeContract) ?? z.unknown()
  const isEmptyResponseExpected = getIsEmptyResponseExpected(routeContract)
  const method = routeContract.method

  if (method === 'post' || method === 'put' || method === 'patch') {
    // @ts-expect-error FixMe
    return sendResourceChange(client, method.toUpperCase(), path, (params as any).body, {
      isEmptyResponseExpected,
      // @ts-expect-error FixMe
      headers: params.headers,
      // @ts-expect-error FixMe
      query: params.queryParams,
      responseSchema,
      ...options,
    })
  }

  // @ts-expect-error FixMe
  return sendNonPayload(client, method.toUpperCase(), path, {
    isEmptyResponseExpected,
    // @ts-expect-error FixMe
    headers: params.headers,
    // @ts-expect-error FixMe
    query: params.queryParams,
    responseSchema,
    ...options,
  })
}

// export function sendByRouteContractWithStreamedResponse<
//   const Contract extends GetRouteContract,
//   DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
// >(
//   client: Client,
//   routeContract: Contract,
//   params: PayloadRouteRequestParams<
//     InferSchemaInput<Contract['requestPathParamsSchema']>,
//     undefined,
//     InferSchemaInput<Contract['requestQuerySchema']>,
//     InferSchemaInput<Contract['requestHeaderSchema']>
//   >,
//   options: Omit<
//     RequestOptions<undefined, false, DoThrowOnError>,
//     | 'body'
//     | 'headers'
//     | 'query'
//     | 'responseSchema'
//     | 'isEmptyResponseExpected'
//     | 'validateResponse'
//     | 'safeParseJson'
//     | 'blobResponseBody'
//   >,
// ): Promise<RequestResultDefinitiveEither<Readable, false, DoThrowOnError>> {
//   // biome-ignore lint/suspicious/noExplicitAny: pathParams key may not be present in params
//   const path = buildRequestPath(
//     routeContract.pathResolver((params as any).pathParams),
//     params.pathPrefix,
//   )
//
//   return sendGetWithStreamedResponse(client, path, {
//     // @ts-expect-error FixMe
//     headers: params.headers,
//     // @ts-expect-error FixMe
//     query: params.queryParams,
//     ...options,
//   })
// }
