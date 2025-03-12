import type { Readable } from 'node:stream'

import { copyWithoutUndefined } from '@lokalise/node-core'
import { Client } from 'undici'
import type { FormData } from 'undici'
import { NO_RETRY_CONFIG, isRequestResult, sendWithRetry } from 'undici-retry'
import type {
  Either,
  InternalRequestError,
  RequestParams,
  RequestResult,
  RetryConfig,
} from 'undici-retry'
import type { ZodError, ZodSchema, z } from 'zod'

import type {
  InferSchemaInput,
  InferSchemaOutput,
  PayloadRouteDefinition,
} from '@lokalise/universal-ts-utils/api-contracts/apiContracts'
import { ResponseStatusError } from '../errors/ResponseStatusError.js'
import type { PayloadRouteRequestParams } from './apiContractTypes.js'
import { DEFAULT_OPTIONS, defaultClientOptions } from './constants.js'
import type {
  InternalRequestOptions,
  RecordObject,
  RequestOptions,
  RequestResultDefinitiveEither,
} from './types.js'

type PayloadMethods = 'POST' | 'PUT' | 'PATCH'
type DEFAULT_THROW_ON_ERROR = typeof DEFAULT_OPTIONS.throwOnError

export function buildClient(baseUrl: string, clientOptions?: Client.Options) {
  return new Client(baseUrl, {
    ...defaultClientOptions,
    ...clientOptions,
  })
}

export async function sendGet<
  T,
  IsEmptyResponseExpected extends boolean = false,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
>(
  client: Client,
  path: string,
  options: RequestOptions<T, IsEmptyResponseExpected, DoThrowOnError>,
): Promise<RequestResultDefinitiveEither<T, IsEmptyResponseExpected, DoThrowOnError>> {
  const result = await sendWithRetry<T>(
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

export async function sendDelete<
  T,
  IsEmptyResponseExpected extends boolean = true,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
>(
  client: Client,
  path: string,
  options: RequestOptions<T, IsEmptyResponseExpected, DoThrowOnError>,
): Promise<RequestResultDefinitiveEither<T, IsEmptyResponseExpected, DoThrowOnError>> {
  const result = await sendWithRetry<T>(
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
  T,
  IsEmptyResponseExpected extends boolean = false,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
>(
  client: Client,
  method: PayloadMethods,
  path: string,
  body: RecordObject | undefined,
  options: RequestOptions<T, IsEmptyResponseExpected, DoThrowOnError>,
) {
  const result = await sendWithRetry<T>(
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

export function sendPost<
  T,
  IsEmptyResponseExpected extends boolean = false,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
>(
  client: Client,
  path: string,
  body: RecordObject | undefined,
  options: RequestOptions<T, IsEmptyResponseExpected, DoThrowOnError>,
): Promise<RequestResultDefinitiveEither<T, IsEmptyResponseExpected, DoThrowOnError>> {
  return sendResourceChange(client, 'POST', path, body, options)
}

export async function sendPostBinary<
  T,
  IsEmptyResponseExpected extends boolean = false,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
>(
  client: Client,
  path: string,
  body: Buffer | Uint8Array | Readable | FormData | null,
  options: RequestOptions<T, IsEmptyResponseExpected, DoThrowOnError>,
): Promise<RequestResultDefinitiveEither<T, IsEmptyResponseExpected, DoThrowOnError>> {
  const result = await sendWithRetry<T>(
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
  T,
  IsEmptyResponseExpected extends boolean = false,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
>(
  client: Client,
  path: string,
  body: RecordObject | undefined,
  options: RequestOptions<T, IsEmptyResponseExpected, DoThrowOnError>,
): Promise<RequestResultDefinitiveEither<T, IsEmptyResponseExpected, DoThrowOnError>> {
  return sendResourceChange(client, 'PUT', path, body, options)
}

export async function sendPutBinary<
  T,
  IsEmptyResponseExpected extends boolean = false,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
>(
  client: Client,
  path: string,
  body: Buffer | Uint8Array | Readable | FormData | null,
  options: RequestOptions<T, IsEmptyResponseExpected, DoThrowOnError>,
): Promise<RequestResultDefinitiveEither<T, IsEmptyResponseExpected, DoThrowOnError>> {
  const result = await sendWithRetry<T>(
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
  T,
  IsEmptyResponseExpected extends boolean = false,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
>(
  client: Client,
  path: string,
  body: RecordObject | undefined,
  options: RequestOptions<T, IsEmptyResponseExpected, DoThrowOnError>,
): Promise<RequestResultDefinitiveEither<T, IsEmptyResponseExpected, DoThrowOnError>> {
  return sendResourceChange(client, 'PATCH', path, body, options)
}

function resolveRequestConfig(options: InternalRequestOptions<unknown>): RequestParams {
  return {
    safeParseJson: options.safeParseJson ?? false,
    blobBody: options.blobResponseBody ?? false,
    throwOnInternalError: false,
    requestLabel: options.requestLabel,
  }
}

function resolveRetryConfig(options: InternalRequestOptions<unknown>): RetryConfig {
  return options.retryConfig ?? NO_RETRY_CONFIG
}

function resolveResult<T, IsEmptyResponseExpected extends boolean, DoThrowOnError extends boolean>(
  requestResult: Either<RequestResult<unknown> | InternalRequestError, RequestResult<T>>,
  throwOnError: DoThrowOnError,
  validateResponse: boolean,
  validationSchema: ZodSchema<T>,
  requestLabel: string,
  isEmptyResponseExpected: IsEmptyResponseExpected,
): RequestResultDefinitiveEither<T, IsEmptyResponseExpected, DoThrowOnError> {
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

  return requestResult as RequestResultDefinitiveEither<T, IsEmptyResponseExpected, DoThrowOnError>
}

function handleRequestResultSuccess<T>(
  result: RequestResult<T>,
  validateResponse: boolean,
  validationSchema: ZodSchema<T>,
  requestLabel: string,
  isEmptyResponseExpected: boolean,
) {
  if (result.statusCode === 204 && isEmptyResponseExpected) {
    // @ts-ignore
    result.body = null
    return result
  }

  if (validateResponse) {
    try {
      result.body = validationSchema.parse(result.body)
    } catch (err: unknown) {
      for (const issue of (err as ZodError).issues) {
        // @ts-ignore
        issue.requestLabel = requestLabel
      }
      // @ts-ignore
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
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
>(
  client: Client,
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
  options: Omit<
    RequestOptions<InferSchemaOutput<ResponseBodySchema>, IsEmptyResponseExpected, DoThrowOnError>,
    'body' | 'headers' | 'query' | 'isEmptyResponseExpected' | 'responseSchema'
  >,
): Promise<
  RequestResultDefinitiveEither<
    InferSchemaOutput<ResponseBodySchema>,
    IsEmptyResponseExpected,
    DoThrowOnError
  >
> {
  return sendResourceChange(
    client,
    // @ts-expect-error TS loses exact string type during uppercasing
    routeDefinition.method.toUpperCase(),
    // @ts-expect-error magic type inferring happening
    routeDefinition.pathResolver(params.pathParams),
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

export const httpClient = {
  get: sendGet,
  post: sendPost,
  put: sendPut,
  patch: sendPatch,
  del: sendDelete,
}
