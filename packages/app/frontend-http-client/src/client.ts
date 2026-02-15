import type {
  DeleteRouteDefinition,
  GetRouteDefinition,
  HttpStatusCode,
  InferSchemaInput,
  InferSchemaOutput,
  PayloadRouteDefinition,
} from '@lokalise/api-contracts'
import { buildRequestPath } from '@lokalise/api-contracts'
import type { WretchResponse } from 'wretch'
import { type ZodSchema, z } from 'zod/v4'
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
} from './types.ts'
import {
  type BodyParseResult,
  parseRequestBody,
  parseResponseBody,
  tryToResolveJsonBody,
} from './utils/bodyUtils.ts'
import { isFailure } from './utils/either.ts'
import { buildWretchError, XmlHttpRequestError } from './utils/errorUtils.ts'
import { parseQueryParams } from './utils/queryUtils.ts'

export const UNKNOWN_SCHEMA = z.unknown()

function resolveHeaders(headers: HeadersSource): HeadersObject | Promise<HeadersObject> {
  return (typeof headers === 'function' ? headers() : headers) ?? {}
}

function handleBodyParseError<RequestBodySchema extends z.ZodSchema>(
  bodyParseResult: BodyParseResult<RequestBodySchema>,
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

  return Promise.reject(bodyParseResult.error)
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

  const resolvedHeaders = await resolveHeaders(params.headers as Record<string, string>)

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
        return handleBodyParseError(bodyParseResult, params, response)
      }

      return bodyParseResult.result
    }) as Promise<
    RequestResultType<ResponseBody, IsNonJSONResponseExpected, IsEmptyResponseExpected>
  >
}

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

  const resolvedHeaders = await resolveHeaders(params.headers as Record<string, string>)

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
        return handleBodyParseError(bodyParseResult, params, response)
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

export async function sendPostWithProgress<ResponseBody>({
  path,
  responseBodySchema,
  headers = {},
  data,
  onProgress,
  abortController,
}: {
  path: string
  headers?: Record<string, string>
  data: XMLHttpRequestBodyInit
  responseBodySchema: ZodSchema<ResponseBody>
  onProgress: (progressEvent: ProgressEvent) => void
  abortController?: AbortController
}): Promise<ResponseBody> {
  const response = await new Promise<ResponseBody>((resolve, reject) => {
    /**
     * Usually we recommend Wretch for Network requests.
     * However, sometimes ( especially during files upload ) we require access to `progress` events
     * emitted by the request. Wretch does not expose this event to consumers, so we use XHR here instead.
     */
    const xhr = new XMLHttpRequest()

    if (abortController)
      abortController.signal.addEventListener('abort', () => {
        xhr.abort()
      })

    xhr.upload.onprogress = (progress) => onProgress(progress)
    xhr.responseType = 'json'

    xhr.open('POST', path, true)

    for (const [headerName, headerValue] of Object.entries(headers)) {
      xhr.setRequestHeader(headerName, headerValue)
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response)
      else reject(new XmlHttpRequestError('File upload failed', xhr.response))
    }

    xhr.onerror = () => {
      reject(new XmlHttpRequestError(`File upload failed: ${xhr.statusText}`))
    }

    xhr.onabort = () => {
      reject(new XmlHttpRequestError('Request aborted'))
    }

    xhr.send(data)
  })

  const bodyParseResult = parseResponseBody<ResponseBody>({
    response,
    responseBodySchema,
    path,
  })

  if (bodyParseResult.error) return Promise.reject(bodyParseResult.error)

  return bodyParseResult.result
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

  const resolvedHeaders = await resolveHeaders(params.headers as Record<string, string>)

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
        return handleBodyParseError(
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

/**
 * @deprecated Use `sendByContract` instead. This function will be removed in a future version.
 */
export function sendByPayloadRoute<
  T extends WretchInstance,
  RequestBodySchema extends z.Schema | undefined,
  ResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  ResponseHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
>(
  wretch: T,
  routeDefinition: PayloadRouteDefinition<
    RequestBodySchema,
    ResponseBodySchema,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema,
    ResponseHeaderSchema,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected,
    ResponseSchemasByStatusCode
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
    path: buildRequestPath(routeDefinition.pathResolver(params.pathParams), params.pathPrefix),
    // @ts-expect-error FixMe
    headers: params.headers,
    // @ts-expect-error magic type inferring happening
    headersSchema: params.headersSchema,
  })
}

/**
 * @deprecated Use `sendByContract` instead. This function will be removed in a future version.
 */
export function sendByGetRoute<
  T extends WretchInstance,
  ResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  ResponseHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
>(
  wretch: T,
  routeDefinition: GetRouteDefinition<
    ResponseBodySchema,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema,
    ResponseHeaderSchema,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected,
    ResponseSchemasByStatusCode
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
  // @ts-expect-error fixme
  return sendGet(wretch, {
    isEmptyResponseExpected: routeDefinition.isEmptyResponseExpected,
    isNonJSONResponseExpected: routeDefinition.isNonJSONResponseExpected,
    responseBodySchema: routeDefinition.successResponseBodySchema,
    // @ts-expect-error magic type inferring happening
    queryParams: params.queryParams,
    queryParamsSchema: routeDefinition.requestQuerySchema,
    // @ts-expect-error magic type inferring happening
    path: buildRequestPath(routeDefinition.pathResolver(params.pathParams), params.pathPrefix),
    // @ts-expect-error FixMe
    headers: params.headers,
    // @ts-expect-error magic type inferring happening
    headersSchema: params.headersSchema,
  })
}

/**
 * @deprecated Use `sendByContract` instead. This function will be removed in a future version.
 */
export function sendByDeleteRoute<
  T extends WretchInstance,
  ResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  ResponseHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = true,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
>(
  wretch: T,
  routeDefinition: DeleteRouteDefinition<
    ResponseBodySchema,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema,
    ResponseHeaderSchema,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected,
    ResponseSchemasByStatusCode
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
  // @ts-expect-error fixme
  return sendDelete(wretch, {
    isEmptyResponseExpected: routeDefinition.isEmptyResponseExpected,
    isNonJSONResponseExpected: routeDefinition.isNonJSONResponseExpected,
    responseBodySchema: routeDefinition.successResponseBodySchema,
    // @ts-expect-error magic type inferring happening
    queryParams: params.queryParams,
    queryParamsSchema: routeDefinition.requestQuerySchema,
    // @ts-expect-error magic type inferring happening
    path: buildRequestPath(routeDefinition.pathResolver(params.pathParams), params.pathPrefix),
    // @ts-expect-error FIXME
    headers: params.headers,
    // @ts-expect-error FIXME
    headersSchema: params.headersSchema,
  })
}

// Overload 1: GET route
export function sendByContract<
  T extends WretchInstance,
  ResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  ResponseHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
>(
  wretch: T,
  routeDefinition: GetRouteDefinition<
    ResponseBodySchema,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema,
    ResponseHeaderSchema,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected,
    ResponseSchemasByStatusCode
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
>

// Overload 2: Payload route (POST/PUT/PATCH)
export function sendByContract<
  T extends WretchInstance,
  RequestBodySchema extends z.Schema | undefined,
  ResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  ResponseHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
>(
  wretch: T,
  routeDefinition: PayloadRouteDefinition<
    RequestBodySchema,
    ResponseBodySchema,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema,
    ResponseHeaderSchema,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected,
    ResponseSchemasByStatusCode
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
>

// Overload 3: DELETE route
export function sendByContract<
  T extends WretchInstance,
  ResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  ResponseHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = true,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
>(
  wretch: T,
  routeDefinition: DeleteRouteDefinition<
    ResponseBodySchema,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema,
    ResponseHeaderSchema,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected,
    ResponseSchemasByStatusCode
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
>

// Implementation
export function sendByContract(
  wretch: WretchInstance,
  // biome-ignore lint/suspicious/noExplicitAny: union of all route definition types
  routeDefinition:
    | GetRouteDefinition<any, any, any, any, any, any, any, any>
    | PayloadRouteDefinition<any, any, any, any, any, any, any, any, any>
    | DeleteRouteDefinition<any, any, any, any, any, any, any, any>,
  // biome-ignore lint/suspicious/noExplicitAny: params type depends on overload
  params: any,
  // biome-ignore lint/suspicious/noExplicitAny: return type depends on overload
): Promise<any> {
  const method = routeDefinition.method
  if (method === 'get') {
    return sendByGetRoute(wretch, routeDefinition, params)
  }
  if (method === 'delete') {
    return sendByDeleteRoute(wretch, routeDefinition, params)
  }
  return sendByPayloadRoute(
    wretch,
    routeDefinition as PayloadRouteDefinition<any, any, any, any, any, any, any, any, any>,
    params,
  )
}
