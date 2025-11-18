import type { Readable } from 'node:stream'
import type {
  DeleteRouteDefinition,
  GetRouteDefinition,
  HttpStatusCode,
  InferSchemaInput,
  InferSchemaOutput,
  PayloadRouteDefinition,
} from '@lokalise/api-contracts'
import { buildRequestPath } from '@lokalise/api-contracts'
import { copyWithoutUndefined } from '@lokalise/node-core'
import type { FormData } from 'undici'
import { Client } from 'undici'
import type {
  Either,
  InternalRequestError,
  RequestParams,
  RequestResult,
  RetryConfig,
} from 'undici-retry'
import {
  isRequestResult,
  NO_RETRY_CONFIG,
  sendWithRetry,
  sendWithRetryReturnStream,
} from 'undici-retry'
import type { ZodError, ZodSchema } from 'zod/v4'
import { z } from 'zod/v4'
import { ResponseStatusError } from '../errors/ResponseStatusError.ts'
import type { PayloadRouteRequestParams, RouteRequestParams } from './apiContractTypes.ts'
import { DEFAULT_OPTIONS, defaultClientOptions } from './constants.ts'
import type {
  InternalRequestOptions,
  RecordObject,
  RequestOptions,
  RequestResultDefinitiveEither,
} from './types.ts'

type PayloadMethods = 'POST' | 'PUT' | 'PATCH'
type NonPayloadMethods = 'DELETE' | 'GET'
type DEFAULT_THROW_ON_ERROR = typeof DEFAULT_OPTIONS.throwOnError

const _EMPTY_SCHEMA = z.null()

export function buildClient(baseUrl: string, clientOptions?: Client.Options) {
  return new Client(baseUrl, {
    ...defaultClientOptions,
    ...clientOptions,
  })
}

export async function sendGet<
  T extends ZodSchema,
  IsEmptyResponseExpected extends boolean = false,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
>(
  client: Client,
  path: string,
  options: RequestOptions<T, IsEmptyResponseExpected, DoThrowOnError>,
): Promise<
  RequestResultDefinitiveEither<InferSchemaOutput<T>, IsEmptyResponseExpected, DoThrowOnError>
> {
  const result = await sendWithRetry<InferSchemaOutput<T>>(
    client,
    {
      ...DEFAULT_OPTIONS,
      path: path,
      method: 'GET',
      query: options.query,
      headers: copyWithoutUndefined({
        'x-request-id': options.reqContext?.reqId,
        ...options.headers,
      }),
      reset: options.disableKeepAlive ?? false,
      bodyTimeout: Object.hasOwn(options, 'timeout') ? options.timeout : DEFAULT_OPTIONS.timeout,
      headersTimeout: Object.hasOwn(options, 'timeout') ? options.timeout : DEFAULT_OPTIONS.timeout,
      throwOnError: undefined,
    },
    resolveRetryConfig(options),
    resolveRequestConfig(options),
  )

  return resolveResult(
    result,
    options.throwOnError ?? (DEFAULT_OPTIONS.throwOnError as DoThrowOnError),
    options.validateResponse ?? DEFAULT_OPTIONS.validateResponse,
    options.responseSchema,
    options.requestLabel,
    options.isEmptyResponseExpected ?? false,
  )
}

export async function sendGetWithStreamedResponse<
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
>(
  client: Client,
  path: string,
  options: Omit<
    RequestOptions<undefined, false, DoThrowOnError>,
    | 'responseSchema'
    | 'validateResponse'
    | 'isEmptyResponseExpected'
    | 'safeParseJson'
    | 'blobResponseBody'
  >,
): Promise<RequestResultDefinitiveEither<Readable, false, DoThrowOnError>> {
  const result = await sendWithRetryReturnStream(
    client,
    {
      ...DEFAULT_OPTIONS,
      path: path,
      method: 'GET',
      query: options.query,
      headers: copyWithoutUndefined({
        'x-request-id': options.reqContext?.reqId,
        ...options.headers,
      }),
      reset: options.disableKeepAlive ?? false,
      bodyTimeout: Object.hasOwn(options, 'timeout') ? options.timeout : DEFAULT_OPTIONS.timeout,
      headersTimeout: Object.hasOwn(options, 'timeout') ? options.timeout : DEFAULT_OPTIONS.timeout,
      throwOnError: undefined,
    },
    resolveRetryConfig(options),
    {
      throwOnInternalError: false,
      requestLabel: options.requestLabel,
    },
  )

  // Handle errors if throwOnError is enabled
  if (result.error && (options.throwOnError ?? DEFAULT_OPTIONS.throwOnError)) {
    throw isRequestResult(result.error)
      ? new ResponseStatusError(result.error, options.requestLabel)
      : result.error
  }

  return result as RequestResultDefinitiveEither<Readable, false, DoThrowOnError>
}

export async function sendDelete<
  T extends ZodSchema,
  IsEmptyResponseExpected extends boolean = true,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
>(
  client: Client,
  path: string,
  options: RequestOptions<T, IsEmptyResponseExpected, DoThrowOnError>,
): Promise<
  RequestResultDefinitiveEither<InferSchemaOutput<T>, IsEmptyResponseExpected, DoThrowOnError>
> {
  const result = await sendWithRetry<InferSchemaOutput<T>>(
    client,
    {
      ...DEFAULT_OPTIONS,
      path,
      method: 'DELETE',
      query: options.query,
      headers: copyWithoutUndefined({
        'x-request-id': options.reqContext?.reqId,
        ...options.headers,
      }),
      reset: options.disableKeepAlive ?? false,
      bodyTimeout: Object.hasOwn(options, 'timeout') ? options.timeout : DEFAULT_OPTIONS.timeout,
      headersTimeout: Object.hasOwn(options, 'timeout') ? options.timeout : DEFAULT_OPTIONS.timeout,
      throwOnError: undefined,
    },
    resolveRetryConfig(options),
    resolveRequestConfig(options),
  )

  return resolveResult(
    result,
    options.throwOnError ?? (DEFAULT_OPTIONS.throwOnError as DoThrowOnError),
    options.validateResponse ?? DEFAULT_OPTIONS.validateResponse,
    options.responseSchema,
    options.requestLabel,
    options.isEmptyResponseExpected ?? true,
  )
}

async function sendResourceChange<
  ResponseBodySchema extends ZodSchema | undefined,
  IsEmptyResponseExpected extends boolean = false,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
>(
  client: Client,
  method: PayloadMethods,
  path: string,
  body: RecordObject | undefined,
  options: RequestOptions<ResponseBodySchema, IsEmptyResponseExpected, DoThrowOnError>,
): Promise<
  RequestResultDefinitiveEither<
    InferSchemaOutput<ResponseBodySchema>,
    IsEmptyResponseExpected,
    DoThrowOnError
  >
> {
  const result = await sendWithRetry<InferSchemaOutput<ResponseBodySchema>>(
    client,
    {
      ...DEFAULT_OPTIONS,
      path: path,
      method,
      body: body ? JSON.stringify(body) : undefined,
      query: options.query,
      headers: copyWithoutUndefined({
        'x-request-id': options.reqContext?.reqId,
        ...options.headers,
      }),
      reset: options.disableKeepAlive ?? false,
      bodyTimeout: Object.hasOwn(options, 'timeout') ? options.timeout : DEFAULT_OPTIONS.timeout,
      headersTimeout: Object.hasOwn(options, 'timeout') ? options.timeout : DEFAULT_OPTIONS.timeout,
      throwOnError: undefined,
    },
    resolveRetryConfig(options),
    resolveRequestConfig(options),
  )

  return resolveResult(
    result,
    options.throwOnError ?? (DEFAULT_OPTIONS.throwOnError as DoThrowOnError),
    options.validateResponse ?? DEFAULT_OPTIONS.validateResponse,
    options.responseSchema,
    options.requestLabel,
    options.isEmptyResponseExpected ?? false,
  )
}

async function sendNonPayload<
  T extends ZodSchema | undefined,
  IsEmptyResponseExpected extends boolean = false,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
>(
  client: Client,
  method: NonPayloadMethods,
  path: string,
  options: Omit<
    RequestOptions<T, IsEmptyResponseExpected, DoThrowOnError>,
    'isEmptyResponseExpected'
  > & { isEmptyResponseExpected: boolean },
) {
  const result = await sendWithRetry<InferSchemaOutput<T>>(
    client,
    {
      ...DEFAULT_OPTIONS,
      path: path,
      method,
      query: options.query,
      headers: copyWithoutUndefined({
        'x-request-id': options.reqContext?.reqId,
        ...options.headers,
      }),
      reset: options.disableKeepAlive ?? false,
      bodyTimeout: Object.hasOwn(options, 'timeout') ? options.timeout : DEFAULT_OPTIONS.timeout,
      headersTimeout: Object.hasOwn(options, 'timeout') ? options.timeout : DEFAULT_OPTIONS.timeout,
      throwOnError: undefined,
    },
    resolveRetryConfig(options),
    resolveRequestConfig(options),
  )

  return resolveResult(
    result,
    options.throwOnError ?? (DEFAULT_OPTIONS.throwOnError as DoThrowOnError),
    options.validateResponse ?? DEFAULT_OPTIONS.validateResponse,
    options.responseSchema,
    options.requestLabel,
    options.isEmptyResponseExpected,
  )
}

export function sendPost<
  T extends ZodSchema,
  IsEmptyResponseExpected extends boolean = false,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
>(
  client: Client,
  path: string,
  body: RecordObject | undefined,
  options: RequestOptions<T, IsEmptyResponseExpected, DoThrowOnError>,
): Promise<
  RequestResultDefinitiveEither<InferSchemaOutput<T>, IsEmptyResponseExpected, DoThrowOnError>
> {
  return sendResourceChange(client, 'POST', path, body, options)
}

export async function sendPostBinary<
  T extends ZodSchema,
  IsEmptyResponseExpected extends boolean = false,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
>(
  client: Client,
  path: string,
  body: Buffer | Uint8Array | Readable | FormData | null,
  options: RequestOptions<T, IsEmptyResponseExpected, DoThrowOnError>,
): Promise<
  RequestResultDefinitiveEither<InferSchemaOutput<T>, IsEmptyResponseExpected, DoThrowOnError>
> {
  const result = await sendWithRetry<InferSchemaOutput<T>>(
    client,
    {
      ...DEFAULT_OPTIONS,
      path: path,
      method: 'POST',
      body,
      query: options.query,
      headers: copyWithoutUndefined({
        'x-request-id': options.reqContext?.reqId,
        ...options.headers,
      }),
      reset: options.disableKeepAlive ?? false,
      bodyTimeout: Object.hasOwn(options, 'timeout') ? options.timeout : DEFAULT_OPTIONS.timeout,
      headersTimeout: Object.hasOwn(options, 'timeout') ? options.timeout : DEFAULT_OPTIONS.timeout,
      throwOnError: undefined,
    },
    resolveRetryConfig(options),
    resolveRequestConfig(options),
  )

  return resolveResult(
    result,
    options.throwOnError ?? (DEFAULT_OPTIONS.throwOnError as DoThrowOnError),
    options.validateResponse ?? DEFAULT_OPTIONS.validateResponse,
    options.responseSchema,
    options.requestLabel,
    options.isEmptyResponseExpected ?? false,
  )
}

export function sendPut<
  T extends ZodSchema,
  IsEmptyResponseExpected extends boolean = false,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
>(
  client: Client,
  path: string,
  body: RecordObject | undefined,
  options: RequestOptions<T, IsEmptyResponseExpected, DoThrowOnError>,
): Promise<
  RequestResultDefinitiveEither<InferSchemaOutput<T>, IsEmptyResponseExpected, DoThrowOnError>
> {
  return sendResourceChange(client, 'PUT', path, body, options)
}

export async function sendPutBinary<
  T extends ZodSchema,
  IsEmptyResponseExpected extends boolean = false,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
>(
  client: Client,
  path: string,
  body: Buffer | Uint8Array | Readable | FormData | null,
  options: RequestOptions<T, IsEmptyResponseExpected, DoThrowOnError>,
): Promise<
  RequestResultDefinitiveEither<InferSchemaOutput<T>, IsEmptyResponseExpected, DoThrowOnError>
> {
  const result = await sendWithRetry<InferSchemaOutput<T>>(
    client,
    {
      ...DEFAULT_OPTIONS,
      path: path,
      method: 'PUT',
      body,
      query: options.query,
      headers: copyWithoutUndefined({
        'x-request-id': options.reqContext?.reqId,
        ...options.headers,
      }),
      reset: options.disableKeepAlive ?? false,
      bodyTimeout: Object.hasOwn(options, 'timeout') ? options.timeout : DEFAULT_OPTIONS.timeout,
      headersTimeout: Object.hasOwn(options, 'timeout') ? options.timeout : DEFAULT_OPTIONS.timeout,
      throwOnError: undefined,
    },
    resolveRetryConfig(options),
    resolveRequestConfig(options),
  )

  return resolveResult(
    result,
    options.throwOnError ?? (DEFAULT_OPTIONS.throwOnError as DoThrowOnError),
    options.validateResponse ?? DEFAULT_OPTIONS.validateResponse,
    options.responseSchema,
    options.requestLabel,
    options.isEmptyResponseExpected ?? false,
  )
}

export function sendPatch<
  T extends ZodSchema,
  IsEmptyResponseExpected extends boolean = false,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
>(
  client: Client,
  path: string,
  body: RecordObject | undefined,
  options: RequestOptions<T, IsEmptyResponseExpected, DoThrowOnError>,
): Promise<
  RequestResultDefinitiveEither<InferSchemaOutput<T>, IsEmptyResponseExpected, DoThrowOnError>
> {
  return sendResourceChange(client, 'PATCH', path, body, options)
}

// biome-ignore lint/suspicious/noExplicitAny: we don't care here
function resolveRequestConfig(options: InternalRequestOptions<any>): RequestParams {
  return {
    safeParseJson: options.safeParseJson ?? false,
    blobBody: options.blobResponseBody ?? false,
    throwOnInternalError: false,
    requestLabel: options.requestLabel,
  }
}

function resolveRetryConfig(
  // biome-ignore lint/suspicious/noExplicitAny: we don't care here
  options: Pick<InternalRequestOptions<any>, 'retryConfig'>,
): RetryConfig {
  return options.retryConfig ?? NO_RETRY_CONFIG
}

function resolveResult<
  T extends ZodSchema | undefined,
  IsEmptyResponseExpected extends boolean,
  DoThrowOnError extends boolean,
>(
  requestResult: Either<
    RequestResult<unknown> | InternalRequestError,
    RequestResult<InferSchemaOutput<T>>
  >,
  throwOnError: DoThrowOnError,
  validateResponse: boolean,
  validationSchema: T,
  requestLabel: string,
  isEmptyResponseExpected: IsEmptyResponseExpected,
): RequestResultDefinitiveEither<InferSchemaOutput<T>, IsEmptyResponseExpected, DoThrowOnError> {
  // Throw response error
  if (requestResult.error && throwOnError) {
    throw isRequestResult(requestResult.error)
      ? new ResponseStatusError(requestResult.error, requestLabel)
      : requestResult.error
  }

  if (requestResult.result) {
    requestResult.result = handleRequestResultSuccess(
      requestResult.result,
      validateResponse,
      validationSchema,
      requestLabel,
      isEmptyResponseExpected,
    )
  }

  return requestResult as RequestResultDefinitiveEither<
    InferSchemaOutput<T>,
    IsEmptyResponseExpected,
    DoThrowOnError
  >
}

function handleRequestResultSuccess<T extends ZodSchema | undefined>(
  result: RequestResult<InferSchemaOutput<T>>,
  validateResponse: boolean,
  validationSchema: T,
  requestLabel: string,
  isEmptyResponseExpected: boolean,
) {
  if (result.statusCode === 204 && isEmptyResponseExpected) {
    // @ts-expect-error
    result.body = null
    return result
  }

  if (validateResponse) {
    if (!validationSchema) {
      throw new Error(`Response validation schema not set for request ${requestLabel}`)
    }
    try {
      // @ts-expect-error no longer infers correctly after v4
      result.body = validationSchema.parse(result.body)
    } catch (err: unknown) {
      for (const issue of (err as ZodError).issues) {
        // @ts-expect-error
        issue.requestLabel = requestLabel
      }
      // @ts-expect-error
      err.requestLabel = requestLabel
      throw err
    }
  }

  return result
}

export function sendByPayloadRoute<
  RequestBodySchema extends z.Schema | undefined,
  ResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  ResponseHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
>(
  client: Client,
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
  options: Omit<
    RequestOptions<ResponseBodySchema, IsEmptyResponseExpected, DoThrowOnError>,
    'body' | 'headers' | 'query' | 'isEmptyResponseExpected' | 'responseSchema'
  >,
): Promise<
  RequestResultDefinitiveEither<
    InferSchemaOutput<ResponseBodySchema>,
    IsEmptyResponseExpected,
    DoThrowOnError
  >
> {
  return sendResourceChange<ResponseBodySchema, IsEmptyResponseExpected, DoThrowOnError>(
    client,
    // @ts-expect-error TS loses exact string type during uppercasing
    routeDefinition.method.toUpperCase(),
    // @ts-expect-error magic type inferring happening
    buildRequestPath(routeDefinition.pathResolver(params.pathParams), params.pathPrefix),
    // @ts-expect-error magic type inferring happening
    params.body,
    {
      isEmptyResponseExpected: routeDefinition.isEmptyResponseExpected,
      // @ts-expect-error FixMe
      headers: params.headers,
      // @ts-expect-error magic type inferring happening
      query: params.queryParams,
      responseSchema: routeDefinition.successResponseBodySchema,
      ...options,
    },
  )
}

export function sendByGetRoute<
  ResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  ResponseHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
>(
  client: Client,
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
  options: Omit<
    RequestOptions<ResponseBodySchema, IsEmptyResponseExpected, DoThrowOnError>,
    'body' | 'headers' | 'query' | 'isEmptyResponseExpected' | 'responseSchema'
  >,
): Promise<
  RequestResultDefinitiveEither<
    InferSchemaOutput<ResponseBodySchema>,
    IsEmptyResponseExpected,
    DoThrowOnError
  >
> {
  return sendNonPayload(
    client,
    // @ts-expect-error TS loses exact string type during uppercasing
    routeDefinition.method.toUpperCase(),
    // @ts-expect-error magic type inferring happening
    buildRequestPath(routeDefinition.pathResolver(params.pathParams), params.pathPrefix),
    {
      isEmptyResponseExpected: routeDefinition.isEmptyResponseExpected ?? false,
      // @ts-expect-error FixMe
      headers: params.headers,
      // @ts-expect-error magic type inferring happening
      query: params.queryParams,
      responseSchema: routeDefinition.successResponseBodySchema,
      ...options,
    },
  )
}

export function sendByDeleteRoute<
  ResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  ResponseHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = true,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
>(
  client: Client,
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
  options: Omit<
    RequestOptions<ResponseBodySchema, IsEmptyResponseExpected, DoThrowOnError>,
    'body' | 'headers' | 'query' | 'isEmptyResponseExpected' | 'responseSchema'
  >,
): Promise<
  RequestResultDefinitiveEither<
    InferSchemaOutput<ResponseBodySchema>,
    IsEmptyResponseExpected,
    DoThrowOnError
  >
> {
  return sendNonPayload(
    client,
    // @ts-expect-error TS loses exact string type during uppercasing
    routeDefinition.method.toUpperCase(),
    // @ts-expect-error magic type inferring happening
    buildRequestPath(routeDefinition.pathResolver(params.pathParams), params.pathPrefix),
    {
      isEmptyResponseExpected: routeDefinition.isEmptyResponseExpected ?? true,
      // @ts-expect-error FixMe
      headers: params.headers,
      // @ts-expect-error magic type inferring happening
      query: params.queryParams,
      responseSchema: routeDefinition.successResponseBodySchema,
      ...options,
    },
  )
}

export function sendByGetRouteWithStreamedResponse<
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
>(
  client: Client,
  routeDefinition: GetRouteDefinition<
    undefined,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema,
    undefined,
    false,
    false,
    undefined
  >,
  params: RouteRequestParams<
    InferSchemaInput<PathParamsSchema>,
    InferSchemaInput<RequestQuerySchema>,
    InferSchemaInput<RequestHeaderSchema>
  >,
  options: Omit<
    RequestOptions<undefined, false, DoThrowOnError>,
    | 'body'
    | 'headers'
    | 'query'
    | 'responseSchema'
    | 'isEmptyResponseExpected'
    | 'validateResponse'
    | 'safeParseJson'
    | 'blobResponseBody'
  >,
): Promise<RequestResultDefinitiveEither<Readable, false, DoThrowOnError>> {
  return sendGetWithStreamedResponse(
    client,
    // @ts-expect-error magic type inferring happening
    buildRequestPath(routeDefinition.pathResolver(params.pathParams), params.pathPrefix),
    {
      // @ts-expect-error FixMe
      headers: params.headers,
      // @ts-expect-error magic type inferring happening
      query: params.queryParams,
      ...options,
    },
  )
}

export const httpClient = {
  get: sendGet,
  post: sendPost,
  put: sendPut,
  patch: sendPatch,
  del: sendDelete,
}
