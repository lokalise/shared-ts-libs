import type { Readable } from 'node:stream'
import type { InferSchemaOutput } from '@lokalise/api-contracts'
import { copyWithoutUndefined, type Either } from '@lokalise/node-core'
import type { FormData } from 'undici'
import { Client } from 'undici'
import type { ZodError, ZodSchema } from 'zod/v4'
import type { InternalRequestError } from '../errors/InternalRequestError.ts'
import { ResponseStatusError } from '../errors/ResponseStatusError.ts'
import { DEFAULT_OPTIONS, defaultClientOptions, REQUEST_ID_HEADER } from './constants.ts'
import { executeRequest, executeStreamRequest, isRequestResult } from './requestExecutor.ts'
import type {
  RecordObject,
  RequestOptions,
  RequestResult,
  RequestResultDefinitiveEither,
} from './types.ts'

type PayloadMethods = 'POST' | 'PUT' | 'PATCH'
type DEFAULT_THROW_ON_ERROR = typeof DEFAULT_OPTIONS.throwOnError

export function buildClient(baseUrl: string, clientOptions?: Client.Options) {
  return new Client(baseUrl, {
    ...defaultClientOptions,
    ...clientOptions,
    bodyTimeout: clientOptions?.bodyTimeout ?? DEFAULT_OPTIONS.timeout,
    headersTimeout: clientOptions?.headersTimeout ?? DEFAULT_OPTIONS.timeout,
  })
}

/**
 * The HTTP client handle returned by `buildClient`. Type client instances with
 * this instead of importing `Client` from `undici` directly, so the undici
 * major version stays an implementation detail of this package.
 */
export type HttpClient = ReturnType<typeof buildClient>

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
  const result = await executeRequest<InferSchemaOutput<T>>(
    client,
    {
      path,
      method: 'GET',
      query: options.query,
      headers: copyWithoutUndefined({
        [REQUEST_ID_HEADER]: options.reqContext?.reqId,
        ...options.headers,
      }),
      reset: options.disableKeepAlive ?? false,
      ...(Object.hasOwn(options, 'timeout') && {
        bodyTimeout: options.timeout,
        headersTimeout: options.timeout,
      }),
    },
    options,
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
  const result = await executeStreamRequest(
    client,
    {
      path,
      method: 'GET',
      query: options.query,
      headers: copyWithoutUndefined({
        [REQUEST_ID_HEADER]: options.reqContext?.reqId,
        ...options.headers,
      }),
      reset: options.disableKeepAlive ?? false,
      ...(Object.hasOwn(options, 'timeout') && {
        bodyTimeout: options.timeout,
        headersTimeout: options.timeout,
      }),
    },
    options,
  )

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
  const result = await executeRequest<InferSchemaOutput<T>>(
    client,
    {
      path,
      method: 'DELETE',
      query: options.query,
      headers: copyWithoutUndefined({
        [REQUEST_ID_HEADER]: options.reqContext?.reqId,
        ...options.headers,
      }),
      reset: options.disableKeepAlive ?? false,
      ...(Object.hasOwn(options, 'timeout') && {
        bodyTimeout: options.timeout,
        headersTimeout: options.timeout,
      }),
    },
    options,
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
  const result = await executeRequest<InferSchemaOutput<ResponseBodySchema>>(
    client,
    {
      path,
      method,
      body: body ? JSON.stringify(body) : undefined,
      query: options.query,
      headers: copyWithoutUndefined({
        [REQUEST_ID_HEADER]: options.reqContext?.reqId,
        ...options.headers,
      }),
      reset: options.disableKeepAlive ?? false,
      ...(Object.hasOwn(options, 'timeout') && {
        bodyTimeout: options.timeout,
        headersTimeout: options.timeout,
      }),
    },
    options,
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

async function sendPayloadWithStreamedResponse<
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
>(
  client: Client,
  method: PayloadMethods,
  path: string,
  body: RecordObject | undefined,
  options: Omit<
    RequestOptions<undefined, false, DoThrowOnError>,
    | 'responseSchema'
    | 'validateResponse'
    | 'isEmptyResponseExpected'
    | 'safeParseJson'
    | 'blobResponseBody'
  >,
): Promise<RequestResultDefinitiveEither<Readable, false, DoThrowOnError>> {
  const result = await executeStreamRequest(
    client,
    {
      path,
      method,
      body: body ? JSON.stringify(body) : undefined,
      query: options.query,
      headers: copyWithoutUndefined({
        [REQUEST_ID_HEADER]: options.reqContext?.reqId,
        ...options.headers,
      }),
      reset: options.disableKeepAlive ?? false,
      ...(Object.hasOwn(options, 'timeout') && {
        bodyTimeout: options.timeout,
        headersTimeout: options.timeout,
      }),
    },
    options,
  )

  if (result.error && (options.throwOnError ?? DEFAULT_OPTIONS.throwOnError)) {
    throw isRequestResult(result.error)
      ? new ResponseStatusError(result.error, options.requestLabel)
      : result.error
  }

  return result as RequestResultDefinitiveEither<Readable, false, DoThrowOnError>
}

export function sendPostWithStreamedResponse<
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
>(
  client: Client,
  path: string,
  body: RecordObject | undefined,
  options: Omit<
    RequestOptions<undefined, false, DoThrowOnError>,
    | 'responseSchema'
    | 'validateResponse'
    | 'isEmptyResponseExpected'
    | 'safeParseJson'
    | 'blobResponseBody'
  >,
): Promise<RequestResultDefinitiveEither<Readable, false, DoThrowOnError>> {
  return sendPayloadWithStreamedResponse(client, 'POST', path, body, options)
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
  const result = await executeRequest<InferSchemaOutput<T>>(
    client,
    {
      path,
      method: 'POST',
      body,
      query: options.query,
      headers: copyWithoutUndefined({
        [REQUEST_ID_HEADER]: options.reqContext?.reqId,
        ...options.headers,
      }),
      reset: options.disableKeepAlive ?? false,
      ...(Object.hasOwn(options, 'timeout') && {
        bodyTimeout: options.timeout,
        headersTimeout: options.timeout,
      }),
    },
    options,
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
  const result = await executeRequest<InferSchemaOutput<T>>(
    client,
    {
      path,
      method: 'PUT',
      body,
      query: options.query,
      headers: copyWithoutUndefined({
        [REQUEST_ID_HEADER]: options.reqContext?.reqId,
        ...options.headers,
      }),
      reset: options.disableKeepAlive ?? false,
      ...(Object.hasOwn(options, 'timeout') && {
        bodyTimeout: options.timeout,
        headersTimeout: options.timeout,
      }),
    },
    options,
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

export const httpClient = {
  get: sendGet,
  post: sendPost,
  put: sendPut,
  patch: sendPatch,
  del: sendDelete,
}
