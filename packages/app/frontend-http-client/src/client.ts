import { z } from 'zod'

import type {
  DeleteRouteDefinition,
  GetRouteDefinition,
  InferSchemaOutput,
  PayloadRouteDefinition,
} from '@lokalise/universal-ts-utils/api-contracts/apiContracts'
import type {
  DeleteParams,
  DeleteParamsWrapper,
  FreeDeleteParams,
  GetParamsWrapper,
  PayloadRequestParamsWrapper,
  PayloadRouteRequestParams,
  RequestResultType,
  RouteRequestParams,
  WretchInstance,
} from './types.js'
import { parseRequestBody, tryToResolveJsonBody } from './utils/bodyUtils.js'
import { isFailure } from './utils/either.js'
import { buildWretchError } from './utils/errorUtils.js'
import { parseQueryParams } from './utils/queryUtils.js'

export const UNKNOWN_SCHEMA = z.unknown()

function sendResourceChange<
  T extends WretchInstance,
  ResponseBody,
  IsNonJSONResponseExpected extends boolean,
  IsEmptyResponseExpected extends boolean,
  RequestBodySchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
>(
  wretch: T,
  method: 'post' | 'put' | 'patch',
  params: PayloadRequestParamsWrapper<
    RequestBodySchema,
    ResponseBody,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected,
    RequestQuerySchema
  >,
): Promise<RequestResultType<ResponseBody, IsNonJSONResponseExpected, IsEmptyResponseExpected>> {
  const body = parseRequestBody({
    body: params.body,
    requestBodySchema: params.requestBodySchema,
    path: params.path,
  })

  if (isFailure(body)) {
    return Promise.reject(body.error)
  }

  const queryParams = parseQueryParams({
    queryParams: params.queryParams,
    queryParamsSchema: params.queryParamsSchema,
    path: params.path,
  })

  if (isFailure(queryParams)) {
    return Promise.reject(queryParams.error)
  }

  return wretch[method](body.result, `${params.path}${queryParams.result}`).res(
    async (response) => {
      const bodyParseResult = await tryToResolveJsonBody(
        response,
        params.path,
        params.responseBodySchema,
      )

      if (bodyParseResult.error === 'NOT_JSON') {
        if (params.isNonJSONResponseExpected === false) {
          return Promise.reject(
            buildWretchError(
              `Request to ${params.path} has returned an unexpected non-JSON response.`,
              response,
            ),
          )
        }
        return response
      }

      if (bodyParseResult.error === 'EMPTY_RESPONSE') {
        if (params.isEmptyResponseExpected === false) {
          return Promise.reject(
            buildWretchError(
              `Request to ${params.path} has returned an unexpected empty response.`,
              response,
            ),
          )
        }

        return null
      }

      if (bodyParseResult.error) {
        return Promise.reject(bodyParseResult.error)
      }

      return bodyParseResult.result
    },
  ) as Promise<RequestResultType<ResponseBody, IsNonJSONResponseExpected, IsEmptyResponseExpected>>
}

/* METHODS */

/* GET */

export function sendGet<
  T extends WretchInstance,
  ResponseBody,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
>(
  wretch: T,
  params: GetParamsWrapper<
    ResponseBody,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected,
    RequestQuerySchema
  >,
): Promise<RequestResultType<ResponseBody, IsNonJSONResponseExpected, IsEmptyResponseExpected>> {
  const queryParams = parseQueryParams({
    queryParams: params.queryParams,
    queryParamsSchema: params.queryParamsSchema,
    path: params.path,
  })

  if (isFailure(queryParams)) {
    return Promise.reject(queryParams.error)
  }

  return wretch.get(`${params.path}${queryParams.result}`).res(async (response) => {
    const bodyParseResult = await tryToResolveJsonBody(
      response,
      params.path,
      params.responseBodySchema,
    )

    if (bodyParseResult.error === 'NOT_JSON') {
      if (params.isNonJSONResponseExpected) {
        return response
      }
      return Promise.reject(
        buildWretchError(
          `Request to ${params.path} has returned an unexpected non-JSON response.`,
          response,
        ),
      )
    }

    if (bodyParseResult.error === 'EMPTY_RESPONSE') {
      if (params.isEmptyResponseExpected) {
        return null
      }
      return Promise.reject(
        buildWretchError(
          `Request to ${params.path} has returned an unexpected empty response.`,
          response,
        ),
      )
    }

    if (bodyParseResult.error) {
      return Promise.reject(bodyParseResult.error)
    }

    return bodyParseResult.result
  }) as Promise<RequestResultType<ResponseBody, IsNonJSONResponseExpected, IsEmptyResponseExpected>>
}

/* POST */

export function sendPost<
  T extends WretchInstance,
  ResponseBody,
  RequestBodySchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
>(
  wretch: T,
  params: PayloadRequestParamsWrapper<
    RequestBodySchema,
    ResponseBody,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected,
    RequestQuerySchema
  >,
): Promise<RequestResultType<ResponseBody, IsNonJSONResponseExpected, IsEmptyResponseExpected>> {
  return sendResourceChange(wretch, 'post', params)
}

/* PUT */

export function sendPut<
  T extends WretchInstance,
  ResponseBody,
  RequestBodySchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
>(
  wretch: T,
  params: PayloadRequestParamsWrapper<
    RequestBodySchema,
    ResponseBody,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected,
    RequestQuerySchema
  >,
): Promise<RequestResultType<ResponseBody, IsNonJSONResponseExpected, IsEmptyResponseExpected>> {
  return sendResourceChange(wretch, 'put', params)
}

/* PATCH */

export function sendPatch<
  T extends WretchInstance,
  ResponseBody,
  RequestBodySchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
>(
  wretch: T,
  params: PayloadRequestParamsWrapper<
    RequestBodySchema,
    ResponseBody,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected,
    RequestQuerySchema
  >,
): Promise<RequestResultType<ResponseBody, IsNonJSONResponseExpected, IsEmptyResponseExpected>> {
  return sendResourceChange(wretch, 'patch', params)
}

/* DELETE */

export function sendDelete<
  T extends WretchInstance,
  ResponseBody,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = true,
>(
  wretch: T,
  params: RequestQuerySchema extends z.Schema
    ? DeleteParams<
        RequestQuerySchema,
        ResponseBody,
        IsNonJSONResponseExpected,
        IsEmptyResponseExpected
      >
    : FreeDeleteParams<ResponseBody, IsNonJSONResponseExpected, IsEmptyResponseExpected>,
): Promise<RequestResultType<ResponseBody, IsNonJSONResponseExpected, IsEmptyResponseExpected>> {
  const queryParams = parseQueryParams({
    queryParams: params.queryParams,
    queryParamsSchema: params.queryParamsSchema,
    path: params.path,
  })

  if (isFailure(queryParams)) {
    return Promise.reject(queryParams.error)
  }

  return wretch.delete(`${params.path}${queryParams.result}`).res(async (response) => {
    const bodyParseResult = await tryToResolveJsonBody(
      response,
      params.path,
      params.responseBodySchema ?? UNKNOWN_SCHEMA,
    )

    if (bodyParseResult.error === 'NOT_JSON') {
      if (params.isNonJSONResponseExpected === false) {
        return Promise.reject(
          buildWretchError(
            `Request to ${params.path} has returned an unexpected non-JSON response.`,
            response,
          ),
        )
      }

      return response
    }

    if (bodyParseResult.error === 'EMPTY_RESPONSE') {
      if (params.isEmptyResponseExpected === false) {
        return Promise.reject(
          buildWretchError(
            `Request to ${params.path} has returned an unexpected empty response.`,
            response,
          ),
        )
      }

      return null
    }

    if (bodyParseResult.error) {
      return Promise.reject(bodyParseResult.error)
    }

    return bodyParseResult.result
  }) as Promise<RequestResultType<ResponseBody, IsNonJSONResponseExpected, IsEmptyResponseExpected>>
}

export function sendByPayloadRoute<
  T extends WretchInstance,
  RequestBodySchema extends z.Schema | undefined,
  ResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
>(
  wretch: T,
  routeDefinition: PayloadRouteDefinition<
    InferSchemaOutput<PathParamsSchema>,
    RequestBodySchema,
    ResponseBodySchema,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected
  >,
  params: PayloadRouteRequestParams<
    InferSchemaOutput<PathParamsSchema>,
    InferSchemaOutput<RequestBodySchema>,
    InferSchemaOutput<RequestQuerySchema>,
    InferSchemaOutput<RequestHeaderSchema>
  >,
): Promise<
  RequestResultType<
    InferSchemaOutput<ResponseBodySchema>,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected
  >
> {
  return sendResourceChange(wretch, routeDefinition.method, {
    // @ts-expect-error magic type inferring happening
    body: params.body,
    isEmptyResponseExpected: routeDefinition.isEmptyResponseExpected,
    isNonJSONResponseExpected: routeDefinition.isNonJSONResponseExpected,
    // biome-ignore lint/suspicious/noExplicitAny: FixMe try to find a solution
    requestBodySchema: routeDefinition.requestBodySchema as any,
    // biome-ignore lint/suspicious/noExplicitAny: FixMe try to find a solution
    responseBodySchema: routeDefinition.responseBodySchema as any,
    // @ts-expect-error magic type inferring happening
    queryParams: params.queryParams,
    queryParamsSchema: routeDefinition.requestQuerySchema,
    // @ts-expect-error magic type inferring happening
    path: routeDefinition.pathResolver(params.pathParams),
  })
}

export function sendByGetRoute<
  T extends WretchInstance,
  ResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
>(
  wretch: T,
  routeDefinition: GetRouteDefinition<
    InferSchemaOutput<PathParamsSchema>,
    ResponseBodySchema,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected
  >,
  params: RouteRequestParams<
    InferSchemaOutput<PathParamsSchema>,
    InferSchemaOutput<RequestQuerySchema>,
    InferSchemaOutput<RequestHeaderSchema>
  >,
): Promise<
  RequestResultType<
    InferSchemaOutput<ResponseBodySchema>,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected
  >
> {
  return sendGet(wretch, {
    isEmptyResponseExpected: routeDefinition.isEmptyResponseExpected,
    isNonJSONResponseExpected: routeDefinition.isNonJSONResponseExpected,
    responseBodySchema: routeDefinition.responseBodySchema,
    // @ts-expect-error magic type inferring happening
    queryParams: params.queryParams,
    queryParamsSchema: routeDefinition.requestQuerySchema,
    // @ts-expect-error magic type inferring happening
    path: routeDefinition.pathResolver(params.pathParams),
  } as GetParamsWrapper<
    InferSchemaOutput<ResponseBodySchema>,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected,
    RequestQuerySchema
  >)
}

export function sendByDeleteRoute<
  T extends WretchInstance,
  ResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = true,
>(
  wretch: T,
  routeDefinition: DeleteRouteDefinition<
    InferSchemaOutput<PathParamsSchema>,
    ResponseBodySchema,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected
  >,
  params: RouteRequestParams<
    InferSchemaOutput<PathParamsSchema>,
    InferSchemaOutput<RequestQuerySchema>,
    InferSchemaOutput<RequestHeaderSchema>
  >,
): Promise<
  RequestResultType<
    InferSchemaOutput<ResponseBodySchema>,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected
  >
> {
  return sendDelete(wretch, {
    isEmptyResponseExpected: routeDefinition.isEmptyResponseExpected,
    isNonJSONResponseExpected: routeDefinition.isNonJSONResponseExpected,
    responseBodySchema: routeDefinition.responseBodySchema,
    // @ts-expect-error magic type inferring happening
    queryParams: params.queryParams,
    queryParamsSchema: routeDefinition.requestQuerySchema,
    // @ts-expect-error magic type inferring happening
    path: routeDefinition.pathResolver(params.pathParams),
  } as DeleteParamsWrapper<
    InferSchemaOutput<ResponseBodySchema>,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected,
    RequestQuerySchema
  >)
}
