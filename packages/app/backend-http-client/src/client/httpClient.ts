import type { Readable } from 'node:stream'

import { copyWithoutUndefined } from '@lokalise/node-core'
import type { DefiniteEither, MayOmit } from '@lokalise/node-core'
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
import { type ZodError, z } from 'zod'

import { ResponseStatusError } from '../errors/ResponseStatusError'

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
type RecordObject = Record<string, any>

/**
 * Technically 204 will send an empty body, but undici-retry defaults to parsing unknown mimetype as text for compatibility reasons, so we should expect to get an empty string here
 */
export const NO_CONTENT_RESPONSE_SCHEMA = z.string().length(0)

/**
 * This schema is to be used when we don't really care about the response type and are prepared to accept any value
 */
export const UNKNOWN_RESPONSE_SCHEMA = z.unknown()

export const TEST_OPTIONS: RequestOptions<unknown> = {
  requestLabel: 'test',
  responseSchema: UNKNOWN_RESPONSE_SCHEMA,
}

export type HttpRequestContext = {
  reqId: string
}

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export type ResponseSchema<Output = any> = {
  parse(data: unknown): Output
}

export type RequestOptions<T> = {
  headers?: RecordObject
  query?: RecordObject
  timeout?: number | null
  throwOnError?: boolean
  reqContext?: HttpRequestContext

  safeParseJson?: boolean
  blobResponseBody?: boolean
  requestLabel: string

  disableKeepAlive?: boolean
  retryConfig?: RetryConfig
  clientOptions?: Client.Options
  responseSchema: ResponseSchema<T>
  validateResponse?: boolean
}

const DEFAULT_OPTIONS = {
  validateResponse: true,
  throwOnError: true,
  timeout: 30000,
} satisfies MayOmit<RequestOptions<unknown>, 'requestLabel' | 'responseSchema'>

const defaultClientOptions: Partial<Client.Options> = {
  keepAliveMaxTimeout: 300_000,
  keepAliveTimeout: 4000,
}

export type Response<T> = {
  body: T
  headers: RecordObject
  statusCode: number
}

export async function sendGet<T>(
  client: Client,
  path: string,
  options: RequestOptions<T>,
): Promise<DefiniteEither<RequestResult<unknown>, RequestResult<T>>> {
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
      throwOnError: false,
    },
    resolveRetryConfig(options),
    resolveRequestConfig(options),
  )

  return resolveResult(
    result,
    options.throwOnError ?? DEFAULT_OPTIONS.throwOnError,
    options.validateResponse ?? DEFAULT_OPTIONS.validateResponse,
    options.responseSchema,
    options.requestLabel,
  )
}

export async function sendDelete<T>(
  client: Client,
  path: string,
  options: RequestOptions<T>,
): Promise<DefiniteEither<RequestResult<unknown>, RequestResult<T>>> {
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
      throwOnError: false,
    },
    resolveRetryConfig(options),
    resolveRequestConfig(options),
  )

  return resolveResult(
    result,
    options.throwOnError ?? DEFAULT_OPTIONS.throwOnError,
    options.validateResponse ?? DEFAULT_OPTIONS.validateResponse,
    options.responseSchema,
    options.requestLabel,
  )
}

export async function sendPost<T>(
  client: Client,
  path: string,
  body: RecordObject | undefined,
  options: RequestOptions<T>,
): Promise<DefiniteEither<RequestResult<unknown>, RequestResult<T>>> {
  const result = await sendWithRetry<T>(
    client,
    {
      ...DEFAULT_OPTIONS,
      path: path,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      query: options.query,
      headers: copyWithoutUndefined({
        'x-request-id': options.reqContext?.reqId,
        ...options.headers,
      }),
      reset: options.disableKeepAlive ?? false,
      bodyTimeout: Object.hasOwn(options, 'timeout') ? options.timeout : DEFAULT_OPTIONS.timeout,
      headersTimeout: Object.hasOwn(options, 'timeout') ? options.timeout : DEFAULT_OPTIONS.timeout,
      throwOnError: false,
    },
    resolveRetryConfig(options),
    resolveRequestConfig(options),
  )

  return resolveResult(
    result,
    options.throwOnError ?? DEFAULT_OPTIONS.throwOnError,
    options.validateResponse ?? DEFAULT_OPTIONS.validateResponse,
    options.responseSchema,
    options.requestLabel,
  )
}

export async function sendPostBinary<T>(
  client: Client,
  path: string,
  body: Buffer | Uint8Array | Readable | FormData | null,
  options: RequestOptions<T>,
): Promise<DefiniteEither<RequestResult<unknown>, RequestResult<T>>> {
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
      throwOnError: false,
    },
    resolveRetryConfig(options),
    resolveRequestConfig(options),
  )

  return resolveResult(
    result,
    options.throwOnError ?? DEFAULT_OPTIONS.throwOnError,
    options.validateResponse ?? DEFAULT_OPTIONS.validateResponse,
    options.responseSchema,
    options.requestLabel,
  )
}

export async function sendPut<T>(
  client: Client,
  path: string,
  body: RecordObject | undefined,
  options: RequestOptions<T>,
): Promise<DefiniteEither<RequestResult<unknown>, RequestResult<T>>> {
  const result = await sendWithRetry<T>(
    client,
    {
      ...DEFAULT_OPTIONS,
      path: path,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
      query: options.query,
      headers: copyWithoutUndefined({
        'x-request-id': options.reqContext?.reqId,
        ...options.headers,
      }),
      reset: options.disableKeepAlive ?? false,
      bodyTimeout: Object.hasOwn(options, 'timeout') ? options.timeout : DEFAULT_OPTIONS.timeout,
      headersTimeout: Object.hasOwn(options, 'timeout') ? options.timeout : DEFAULT_OPTIONS.timeout,
      throwOnError: false,
    },
    resolveRetryConfig(options),
    resolveRequestConfig(options),
  )

  return resolveResult(
    result,
    options.throwOnError ?? DEFAULT_OPTIONS.throwOnError,
    options.validateResponse ?? DEFAULT_OPTIONS.validateResponse,
    options.responseSchema,
    options.requestLabel,
  )
}

export async function sendPutBinary<T>(
  client: Client,
  path: string,
  body: Buffer | Uint8Array | Readable | FormData | null,
  options: RequestOptions<T>,
): Promise<DefiniteEither<RequestResult<unknown>, RequestResult<T>>> {
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
      throwOnError: false,
    },
    resolveRetryConfig(options),
    resolveRequestConfig(options),
  )

  return resolveResult(
    result,
    options.throwOnError ?? DEFAULT_OPTIONS.throwOnError,
    options.validateResponse ?? DEFAULT_OPTIONS.validateResponse,
    options.responseSchema,
    options.requestLabel,
  )
}

export async function sendPatch<T>(
  client: Client,
  path: string,
  body: RecordObject | undefined,
  options: RequestOptions<T>,
): Promise<DefiniteEither<RequestResult<unknown>, RequestResult<T>>> {
  const result = await sendWithRetry<T>(
    client,
    {
      ...DEFAULT_OPTIONS,
      path: path,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
      query: options.query,
      headers: copyWithoutUndefined({
        'x-request-id': options.reqContext?.reqId,
        ...options.headers,
      }),
      reset: options.disableKeepAlive ?? false,
      bodyTimeout: Object.hasOwn(options, 'timeout') ? options.timeout : DEFAULT_OPTIONS.timeout,
      headersTimeout: Object.hasOwn(options, 'timeout') ? options.timeout : DEFAULT_OPTIONS.timeout,
      throwOnError: false,
    },
    resolveRetryConfig(options),
    resolveRequestConfig(options),
  )

  return resolveResult(
    result,
    options.throwOnError ?? DEFAULT_OPTIONS.throwOnError,
    options.validateResponse ?? DEFAULT_OPTIONS.validateResponse,
    options.responseSchema,
    options.requestLabel,
  )
}

function resolveRequestConfig(options: RequestOptions<unknown>): RequestParams {
  return {
    safeParseJson: options.safeParseJson ?? false,
    blobBody: options.blobResponseBody ?? false,
    throwOnInternalError: false,
    requestLabel: options.requestLabel,
  }
}

function resolveRetryConfig(options: Partial<RequestOptions<unknown>>): RetryConfig {
  return options.retryConfig ?? NO_RETRY_CONFIG
}

export function buildClient(baseUrl: string, clientOptions?: Client.Options) {
  const newClient = new Client(baseUrl, {
    ...defaultClientOptions,
    ...clientOptions,
  })
  return newClient
}

function resolveResult<T>(
  requestResult: Either<RequestResult<unknown> | InternalRequestError, RequestResult<T>>,
  throwOnError: boolean,
  validateResponse: boolean,
  validationSchema: ResponseSchema,
  requestLabel: string,
): DefiniteEither<RequestResult<unknown>, RequestResult<T>> {
  // Throw response error
  if (requestResult.error && throwOnError) {
    if (isRequestResult(requestResult.error)) {
      throw new ResponseStatusError(requestResult.error, requestLabel)
    }
    throw requestResult.error
  }
  if (requestResult.result && validateResponse) {
    try {
      requestResult.result.body = validationSchema.parse(requestResult.result.body)
      // @ts-ignore
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

  return requestResult as DefiniteEither<RequestResult<unknown>, RequestResult<T>>
}

export const httpClient = {
  get: sendGet,
  post: sendPost,
  put: sendPut,
  patch: sendPatch,
  del: sendDelete,
}

export const JSON_HEADERS = {
  'Content-Type': 'application/json',
}
