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
  RequestResultType,
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

function resolveHeaders(
  headers: HeadersSource | undefined,
): HeadersObject | Promise<HeadersObject> {
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

  const resolvedHeaders = await resolveHeaders(params.headers as HeadersSource | undefined)

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

  const resolvedHeaders = await resolveHeaders(params.headers as HeadersSource | undefined)

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

  const resolvedHeaders = await resolveHeaders(params.headers as HeadersSource | undefined)

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
