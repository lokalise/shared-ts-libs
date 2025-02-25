import { type ZodError, z } from 'zod'

import type {
  DeleteRouteDefinition,
  GetRouteDefinition,
  InferSchemaInput,
  InferSchemaOutput,
  PayloadRouteDefinition,
} from '@lokalise/universal-ts-utils/api-contracts/apiContracts'
import type { WretchResponse } from 'wretch'
import type {
  DeleteParams,
  FreeDeleteParams,
  FreeHeadersParams,
  GetParamsWrapper,
  HeadersObject,
  HeadersParams,
  HeadersSource,
  PayloadRequestParamsWrapper,
  PayloadRouteRequestParams,
  RequestResultType,
  RouteRequestParams,
  WretchInstance,
} from './types.js'
import { parseRequestBody, tryToResolveJsonBody } from './utils/bodyUtils.js'
import { type Either, isFailure } from './utils/either.js'
import { buildWretchError } from './utils/errorUtils.js'
import { parseQueryParams } from './utils/queryUtils.js'

export const UNKNOWN_SCHEMA = z.unknown()

function resolveHeaders(headers: HeadersSource): HeadersObject | Promise<HeadersObject> {
  return (typeof headers === 'function' ? headers() : headers) ?? {}
}

function handleBodyParseResult<RequestBodySchema extends z.ZodSchema>(
  bodyParseResult: Either<
    'NOT_JSON' | 'EMPTY_RESPONSE' | ZodError<RequestBodySchema>,
    z.output<RequestBodySchema>
  >,
  params: {
    isNonJSONResponseExpected?: boolean
    isEmptyResponseExpected?: boolean

    path: string
  },
  response: WretchResponse,
) {
  if (bodyParseResult.error === 'NOT_JSON') {
    if (!params.isNonJSONResponseExpected) {
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
    if (!params.isEmptyResponseExpected) {
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
}

async function sendResourceChange<
  T extends WretchInstance,
  ResponseBody,
  IsNonJSONResponseExpected extends boolean,
  IsEmptyResponseExpected extends boolean,
  RequestBodySchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
>(
  wretch: T,
  method: 'post' | 'put' | 'patch',
  params: PayloadRequestParamsWrapper<
    RequestBodySchema,
    ResponseBody,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected,
    RequestQuerySchema,
    RequestHeaderSchema
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

  const resolvedHeaders = await resolveHeaders(params.headers)

  return wretch
    .headers(resolvedHeaders)
    [method](body.result, `${params.path}${queryParams.result}`)
    .res(async (response) => {
      const bodyParseResult = await tryToResolveJsonBody(
        response,
        params.path,
        params.responseBodySchema,
        params.isEmptyResponseExpected,
      )

      if (bodyParseResult.error) {
        return handleBodyParseResult(bodyParseResult, params, response)
      }

      return bodyParseResult.result
    }) as Promise<
    RequestResultType<ResponseBody, IsNonJSONResponseExpected, IsEmptyResponseExpected>
  >
}

/* METHODS */

/* GET */

export async function sendGet<
  T extends WretchInstance,
  ResponseBody,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeadersSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
>(
  wretch: T,
  params: GetParamsWrapper<
    ResponseBody,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected,
    RequestQuerySchema,
    RequestHeadersSchema
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

  const resolvedHeaders = await resolveHeaders(params.headers)

  return wretch
    .headers(resolvedHeaders)
    .get(`${params.path}${queryParams.result}`)
    .res(async (response) => {
      const bodyParseResult = await tryToResolveJsonBody(
        response,
        params.path,
        params.responseBodySchema,
        params.isEmptyResponseExpected,
      )

      if (bodyParseResult.error) {
        return handleBodyParseResult(bodyParseResult, params, response)
      }

      return bodyParseResult.result
    }) as Promise<
    RequestResultType<ResponseBody, IsNonJSONResponseExpected, IsEmptyResponseExpected>
  >
}

/* POST */

export function sendPost<
  T extends WretchInstance,
  ResponseBody,
  RequestBodySchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeadersSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
>(
  wretch: T,
  params: PayloadRequestParamsWrapper<
    RequestBodySchema,
    ResponseBody,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected,
    RequestQuerySchema,
    RequestHeadersSchema
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
  RequestHeadersSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
>(
  wretch: T,
  params: PayloadRequestParamsWrapper<
    RequestBodySchema,
    ResponseBody,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected,
    RequestQuerySchema,
    RequestHeadersSchema
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
  RequestHeadersSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
>(
  wretch: T,
  params: PayloadRequestParamsWrapper<
    RequestBodySchema,
    ResponseBody,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected,
    RequestQuerySchema,
    RequestHeadersSchema
  >,
): Promise<RequestResultType<ResponseBody, IsNonJSONResponseExpected, IsEmptyResponseExpected>> {
  return sendResourceChange(wretch, 'patch', params)
}

/* DELETE */

export async function sendDelete<
  T extends WretchInstance,
  ResponseBody,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeadersSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = true,
>(
  wretch: T,
  params: (RequestQuerySchema extends z.Schema
    ? DeleteParams<
        RequestQuerySchema,
        ResponseBody,
        IsNonJSONResponseExpected,
        IsEmptyResponseExpected
      >
    : FreeDeleteParams<ResponseBody, IsNonJSONResponseExpected, IsEmptyResponseExpected>) &
    (RequestHeadersSchema extends z.Schema
      ? Omit<HeadersParams<RequestHeadersSchema>, 'responseBodySchema'>
      : Omit<FreeHeadersParams<RequestHeadersSchema>, 'responseBodySchema'>),
): Promise<RequestResultType<ResponseBody, IsNonJSONResponseExpected, IsEmptyResponseExpected>> {
  const queryParams = parseQueryParams({
    queryParams: params.queryParams,
    queryParamsSchema: params.queryParamsSchema,
    path: params.path,
  })

  if (isFailure(queryParams)) {
    return Promise.reject(queryParams.error)
  }

  const resolvedHeaders = await resolveHeaders(params.headers)

  return wretch
    .headers(resolvedHeaders)
    .delete(`${params.path}${queryParams.result}`)
    .res(async (response) => {
      const bodyParseResult = await tryToResolveJsonBody(
        response,
        params.path,
        params.responseBodySchema ?? UNKNOWN_SCHEMA,
        params.isEmptyResponseExpected ?? true,
      )

      if (bodyParseResult.error) {
        return handleBodyParseResult(
          bodyParseResult,
          {
            isNonJSONResponseExpected: params.isNonJSONResponseExpected,
            path: params.path,
            isEmptyResponseExpected: params.isEmptyResponseExpected ?? true,
          },
          response,
        )
      }

      return bodyParseResult.result
    }) as Promise<
    RequestResultType<ResponseBody, IsNonJSONResponseExpected, IsEmptyResponseExpected>
  >
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
    InferSchemaInput<PathParamsSchema>,
    InferSchemaInput<RequestBodySchema>,
    InferSchemaInput<RequestQuerySchema>,
    InferSchemaInput<RequestHeaderSchema>
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
    responseBodySchema: routeDefinition.successResponseBodySchema as any,
    // @ts-expect-error magic type inferring happening
    queryParams: params.queryParams,
    queryParamsSchema: routeDefinition.requestQuerySchema,
    // @ts-expect-error magic type inferring happening
    path: routeDefinition.pathResolver(params.pathParams),
    // @ts-expect-error FixMe
    headers: params.headers,
    // @ts-expect-error magic type inferring happening
    headersSchema: params.headersSchema,
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
    InferSchemaInput<PathParamsSchema>,
    InferSchemaInput<RequestQuerySchema>,
    InferSchemaInput<RequestHeaderSchema>
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
    responseBodySchema: routeDefinition.successResponseBodySchema,
    // @ts-expect-error magic type inferring happening
    queryParams: params.queryParams,
    queryParamsSchema: routeDefinition.requestQuerySchema,
    // @ts-expect-error magic type inferring happening
    path: routeDefinition.pathResolver(params.pathParams),
    // @ts-expect-error FixMe
    headers: params.headers,
    // @ts-expect-error magic type inferring happening
    headersSchema: params.headersSchema,
  })
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
    InferSchemaInput<PathParamsSchema>,
    InferSchemaInput<RequestQuerySchema>,
    InferSchemaInput<RequestHeaderSchema>
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
    responseBodySchema: routeDefinition.successResponseBodySchema,
    // @ts-expect-error magic type inferring happening
    queryParams: params.queryParams,
    queryParamsSchema: routeDefinition.requestQuerySchema,
    // @ts-expect-error magic type inferring happening
    path: routeDefinition.pathResolver(params.pathParams),
    // @ts-expect-error FIXME
    headers: params.headers,
    // @ts-expect-error FIXME
    headersSchema: params.headersSchema,
  })
}
