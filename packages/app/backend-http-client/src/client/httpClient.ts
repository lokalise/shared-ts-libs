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
import { copyWithoutUndefined, type Either } from '@lokalise/node-core'
import type { FormData } from 'undici'
import { Client } from 'undici'
import type { ZodError, ZodSchema, z } from 'zod/v4'
import type { InternalRequestError } from '../errors/InternalRequestError.ts'
import { ResponseStatusError } from '../errors/ResponseStatusError.ts'
import type { PayloadRouteRequestParams, RouteRequestParams } from './apiContractTypes.ts'
import { DEFAULT_OPTIONS, defaultClientOptions, REQUEST_ID_HEADER } from './constants.ts'
import { executeRequest, executeStreamRequest, isRequestResult } from './requestExecutor.ts'
import type {
  RecordObject,
  RequestOptions,
  RequestResult,
  RequestResultDefinitiveEither,
} from './types.ts'

type PayloadMethods = 'POST' | 'PUT' | 'PATCH'
type NonPayloadMethods = 'DELETE' | 'GET'
type DEFAULT_THROW_ON_ERROR = typeof DEFAULT_OPTIONS.throwOnError

export function buildClient(baseUrl: string, clientOptions?: Client.Options) {
  return new Client(baseUrl, {
    ...defaultClientOptions,
    ...clientOptions,
    bodyTimeout: clientOptions?.bodyTimeout ?? DEFAULT_OPTIONS.timeout,
    headersTimeout: clientOptions?.headersTimeout ?? DEFAULT_OPTIONS.timeout,
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
  const result = await executeRequest<InferSchemaOutput<T>>(
    client,
    {
      path,
      method,
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

/**
 * @deprecated Use `sendByApiContract` instead. This function will be removed in a future version.
 */
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

/**
 * @deprecated Use `sendByApiContract` instead. This function will be removed in a future version.
 */
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

/**
 * @deprecated Use `sendByApiContract` instead. This function will be removed in a future version.
 */
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

/**
 * @deprecated Use `sendByApiContract` instead. This function will be removed in a future version.
 */
export function sendByGetRouteWithStreamedResponse<
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
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
    ResponseSchemasByStatusCode
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

/**
 * @deprecated Use `sendByApiContract` instead. This function will be removed in a future version.
 */
export function sendByPayloadRouteWithStreamedResponse<
  RequestBodySchema extends z.Schema | undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
>(
  client: Client,
  routeDefinition: PayloadRouteDefinition<
    RequestBodySchema,
    undefined,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema,
    undefined,
    false,
    false,
    ResponseSchemasByStatusCode
  >,
  params: PayloadRouteRequestParams<
    InferSchemaInput<PathParamsSchema>,
    InferSchemaInput<RequestBodySchema>,
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
  return sendPayloadWithStreamedResponse(
    client,
    // @ts-expect-error TS loses exact string type during uppercasing
    routeDefinition.method.toUpperCase(),
    // @ts-expect-error magic type inferring happening
    buildRequestPath(routeDefinition.pathResolver(params.pathParams), params.pathPrefix),
    // @ts-expect-error magic type inferring happening
    params.body,
    {
      // @ts-expect-error FixMe
      headers: params.headers,
      // @ts-expect-error magic type inferring happening
      query: params.queryParams,
      ...options,
    },
  )
}

/**
 * @deprecated Use `sendByApiContract` instead. This function will be removed in a future version.
 * @example
 * ```typescript
 * // Before (deprecated):
 * const result = await sendByContract(client, someGetRouteDefinition,
 *   { pathParams: { userId: 1 } },
 *   { requestLabel: 'Get user' },
 * )
 *
 * // After (recommended):
 * const result = await sendByApiContract(client, someGetContract, {
 *   pathParams: { userId: 1 },
 * })
 * ```
 */
// Overload 1: GET route
export function sendByContract<
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
>

// Overload 2: Payload route (POST/PUT/PATCH)
export function sendByContract<
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
>

// Overload 3: DELETE route
export function sendByContract<
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
>

// Implementation
export function sendByContract(
  client: Client,
  routeDefinition: // biome-ignore lint/suspicious/noExplicitAny: union of all route definition types
    | GetRouteDefinition<any, any, any, any, any, any, any, any>
    // biome-ignore lint/suspicious/noExplicitAny: union of all route definition types
    | PayloadRouteDefinition<any, any, any, any, any, any, any, any, any>
    // biome-ignore lint/suspicious/noExplicitAny: union of all route definition types
    | DeleteRouteDefinition<any, any, any, any, any, any, any, any>,
  // biome-ignore lint/suspicious/noExplicitAny: params type depends on overload
  params: any,
  // biome-ignore lint/suspicious/noExplicitAny: options type depends on overload
  options: any,
  // biome-ignore lint/suspicious/noExplicitAny: return type depends on overload
): Promise<any> {
  const method = routeDefinition.method
  if (method === 'get') {
    return sendByGetRoute(client, routeDefinition, params, options)
  }
  if (method === 'delete') {
    return sendByDeleteRoute(client, routeDefinition, params, options)
  }
  return sendByPayloadRoute(
    client,
    // biome-ignore lint/suspicious/noExplicitAny: union of all route definition types
    routeDefinition as PayloadRouteDefinition<any, any, any, any, any, any, any, any, any>,
    params,
    options,
  )
}

/**
 * @deprecated Use `sendByApiContract` with an SSE contract instead. This function will be removed in a future version.
 * @example
 * ```typescript
 * // Before (deprecated):
 * const result = await sendByContractWithStreamedResponse(client, downloadContract,
 *   { pathParams: { fileId: '123' } },
 *   { requestLabel: 'Download file' },
 * )
 *
 * // After (recommended):
 * const result = await sendByApiContract(client, downloadContract, {
 *   pathParams: { fileId: '123' },
 * })
 * ```
 */
// Overload 1: GET route
export function sendByContractWithStreamedResponse<
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
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
    ResponseSchemasByStatusCode
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
): Promise<RequestResultDefinitiveEither<Readable, false, DoThrowOnError>>

// Overload 2: Payload route (POST/PUT/PATCH)
export function sendByContractWithStreamedResponse<
  RequestBodySchema extends z.Schema | undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
>(
  client: Client,
  routeDefinition: PayloadRouteDefinition<
    RequestBodySchema,
    undefined,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema,
    undefined,
    false,
    false,
    ResponseSchemasByStatusCode
  >,
  params: PayloadRouteRequestParams<
    InferSchemaInput<PathParamsSchema>,
    InferSchemaInput<RequestBodySchema>,
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
): Promise<RequestResultDefinitiveEither<Readable, false, DoThrowOnError>>

// Implementation
export function sendByContractWithStreamedResponse(
  client: Client,
  routeDefinition: // biome-ignore lint/suspicious/noExplicitAny: union of all route definition types
    | GetRouteDefinition<any, any, any, any, any, any, any, any>
    // biome-ignore lint/suspicious/noExplicitAny: union of all route definition types
    | PayloadRouteDefinition<any, any, any, any, any, any, any, any, any>,
  // biome-ignore lint/suspicious/noExplicitAny: params type depends on overload
  params: any,
  // biome-ignore lint/suspicious/noExplicitAny: options type depends on overload
  options: any,
  // biome-ignore lint/suspicious/noExplicitAny: return type depends on overload
): Promise<any> {
  if (routeDefinition.method === 'get') {
    return sendByGetRouteWithStreamedResponse(client, routeDefinition, params, options)
  }
  return sendByPayloadRouteWithStreamedResponse(
    client,
    // biome-ignore lint/suspicious/noExplicitAny: union of all route definition types
    routeDefinition as PayloadRouteDefinition<any, any, any, any, any, any, any, any, any>,
    params,
    options,
  )
}

export const httpClient = {
  get: sendGet,
  post: sendPost,
  put: sendPut,
  patch: sendPatch,
  del: sendDelete,
}
