import {
  buildRequestPath,
  ContractNoBody,
  type HasAnyNonJsonSuccessResponse,
  type HttpStatusCode,
  type InferSchemaInput,
  type InferSuccessResponse,
  isTypedNonJsonResponse,
  type RouteContract,
} from '@lokalise/api-contracts'
import type { WretchResponse } from 'wretch'
import { z } from 'zod/v4'
import { resolveHeaders } from './client.ts'
import type { PayloadRouteRequestParams, WretchInstance } from './types.ts'
import { parseRequestBody, parseResponseBody } from './utils/bodyUtils.ts'
import { isFailure } from './utils/either.ts'
import { parseQueryParams } from './utils/queryUtils.ts'

type ExtractBodyInput<T> = T extends { requestBodySchema: z.ZodType }
  ? T['requestBodySchema']
  : undefined

export async function sendByRouteContract<const Contract extends RouteContract>(
  wretch: WretchInstance,
  routeContract: Contract,
  params: PayloadRouteRequestParams<
    InferSchemaInput<Contract['requestPathParamsSchema']>,
    InferSchemaInput<ExtractBodyInput<Contract>>,
    InferSchemaInput<Contract['requestQuerySchema']>,
    InferSchemaInput<Contract['requestHeaderSchema']>
  >,
): Promise<
  HasAnyNonJsonSuccessResponse<Contract['responseSchemasByStatusCode']> extends true
    ? WretchResponse
    : InferSuccessResponse<Contract['responseSchemasByStatusCode']>
> {
  // biome-ignore lint/suspicious/noExplicitAny: pathParams key may not be present in params
  const anyParams = params as any
  const path = buildRequestPath(
    routeContract.pathResolver(anyParams.pathParams),
    anyParams.pathPrefix,
  )

  const queryParamsResult = parseQueryParams({
    queryParams: anyParams.queryParams,
    queryParamsSchema: routeContract.requestQuerySchema,
    path,
  })

  if (isFailure(queryParamsResult)) {
    return Promise.reject(queryParamsResult.error)
  }

  const resolvedHeaders = await resolveHeaders(anyParams.headers ?? {})
  const fullPath = `${path}${queryParamsResult.result}`

  const requestBodySchema =
    routeContract.requestBodySchema instanceof z.ZodType
      ? routeContract.requestBodySchema
      : undefined

  const bodyResult = requestBodySchema
    ? parseRequestBody({ body: anyParams.body, requestBodySchema, path })
    : null

  if (bodyResult && isFailure(bodyResult)) {
    return Promise.reject(bodyResult.error)
  }

  const handleResponse = async (response: WretchResponse) => {
    const responseSchema =
      routeContract.responseSchemasByStatusCode?.[response.status as HttpStatusCode]

    if (!responseSchema || isTypedNonJsonResponse(responseSchema)) {
      return response
    }
    if (responseSchema === ContractNoBody) {
      return null
    }

    const responseBody = await response.json()

    const bodyParseResult = parseResponseBody({
      response: responseBody,
      responseBodySchema: responseSchema,
      path,
    })

    if (isFailure(bodyParseResult)) {
      return Promise.reject(bodyParseResult.error)
    }

    return bodyParseResult.result
  }

  // @ts-expect-error result is typed as unknown
  return wretch
    .url(fullPath)
    .headers(resolvedHeaders)
    [routeContract.method](
      // @ts-expect-error body can be available on payload contracts
      bodyResult ? bodyResult.result : undefined,
    )
    .res(handleResponse)
}
