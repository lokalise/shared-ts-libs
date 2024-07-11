import type { Readable } from "node:stream";

import { copyWithoutUndefined } from "@lokalise/node-core";
import { Client } from "undici";
import type { FormData } from "undici";
import { NO_RETRY_CONFIG, isRequestResult, sendWithRetry } from "undici-retry";
import type {
  Either,
  InternalRequestError,
  RequestParams,
  RequestResult,
  RetryConfig,
} from "undici-retry";
import type { ZodError, ZodSchema } from "zod";

import { ResponseStatusError } from "../errors/ResponseStatusError";
import { DEFAULT_OPTIONS, defaultClientOptions } from "./constants";
import type {
  InternalRequestOptions,
  RecordObject,
  RequestOptions,
  RequestResultDefinitiveEither,
} from "./types";

export function buildClient(baseUrl: string, clientOptions?: Client.Options) {
  return new Client(baseUrl, {
    ...defaultClientOptions,
    ...clientOptions,
  });
}

export async function sendGet<
  T,
  IsEmptyResponseExpected extends boolean = false,
>(
  client: Client,
  path: string,
  options: RequestOptions<T, IsEmptyResponseExpected>,
): Promise<RequestResultDefinitiveEither<T, IsEmptyResponseExpected>> {
  const result = await sendWithRetry<T>(
    client,
    {
      ...DEFAULT_OPTIONS,
      path: path,
      method: "GET",
      query: options.query,
      headers: copyWithoutUndefined({
        "x-request-id": options.reqContext?.reqId,
        ...options.headers,
      }),
      reset: options.disableKeepAlive ?? false,
      bodyTimeout: Object.hasOwn(options, "timeout")
        ? options.timeout
        : DEFAULT_OPTIONS.timeout,
      headersTimeout: Object.hasOwn(options, "timeout")
        ? options.timeout
        : DEFAULT_OPTIONS.timeout,
      throwOnError: false,
    },
    resolveRetryConfig(options),
    resolveRequestConfig(options),
  );

  return resolveResult(
    result,
    options.throwOnError ?? DEFAULT_OPTIONS.throwOnError,
    options.validateResponse ?? DEFAULT_OPTIONS.validateResponse,
    options.responseSchema,
    options.requestLabel,
    options.isEmptyResponseExpected ?? false,
  );
}

export async function sendDelete<
  T,
  IsEmptyResponseExpected extends boolean = true,
>(
  client: Client,
  path: string,
  options: RequestOptions<T, IsEmptyResponseExpected>,
): Promise<RequestResultDefinitiveEither<T, IsEmptyResponseExpected>> {
  const result = await sendWithRetry<T>(
    client,
    {
      ...DEFAULT_OPTIONS,
      path,
      method: "DELETE",
      query: options.query,
      headers: copyWithoutUndefined({
        "x-request-id": options.reqContext?.reqId,
        ...options.headers,
      }),
      reset: options.disableKeepAlive ?? false,
      bodyTimeout: Object.hasOwn(options, "timeout")
        ? options.timeout
        : DEFAULT_OPTIONS.timeout,
      headersTimeout: Object.hasOwn(options, "timeout")
        ? options.timeout
        : DEFAULT_OPTIONS.timeout,
      throwOnError: false,
    },
    resolveRetryConfig(options),
    resolveRequestConfig(options),
  );

  return resolveResult(
    result,
    options.throwOnError ?? DEFAULT_OPTIONS.throwOnError,
    options.validateResponse ?? DEFAULT_OPTIONS.validateResponse,
    options.responseSchema,
    options.requestLabel,
    options.isEmptyResponseExpected ?? true,
  );
}

export async function sendPost<
  T,
  IsEmptyResponseExpected extends boolean = true,
>(
  client: Client,
  path: string,
  body: RecordObject | undefined,
  options: RequestOptions<T, IsEmptyResponseExpected>,
): Promise<RequestResultDefinitiveEither<T, IsEmptyResponseExpected>> {
  const result = await sendWithRetry<T>(
    client,
    {
      ...DEFAULT_OPTIONS,
      path: path,
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
      query: options.query,
      headers: copyWithoutUndefined({
        "x-request-id": options.reqContext?.reqId,
        ...options.headers,
      }),
      reset: options.disableKeepAlive ?? false,
      bodyTimeout: Object.hasOwn(options, "timeout")
        ? options.timeout
        : DEFAULT_OPTIONS.timeout,
      headersTimeout: Object.hasOwn(options, "timeout")
        ? options.timeout
        : DEFAULT_OPTIONS.timeout,
      throwOnError: false,
    },
    resolveRetryConfig(options),
    resolveRequestConfig(options),
  );

  return resolveResult(
    result,
    options.throwOnError ?? DEFAULT_OPTIONS.throwOnError,
    options.validateResponse ?? DEFAULT_OPTIONS.validateResponse,
    options.responseSchema,
    options.requestLabel,
    options.isEmptyResponseExpected ?? true,
  );
}

export async function sendPostBinary<
  T,
  IsEmptyResponseExpected extends boolean = true,
>(
  client: Client,
  path: string,
  body: Buffer | Uint8Array | Readable | FormData | null,
  options: RequestOptions<T, IsEmptyResponseExpected>,
): Promise<RequestResultDefinitiveEither<T, IsEmptyResponseExpected>> {
  const result = await sendWithRetry<T>(
    client,
    {
      ...DEFAULT_OPTIONS,
      path: path,
      method: "POST",
      body,
      query: options.query,
      headers: copyWithoutUndefined({
        "x-request-id": options.reqContext?.reqId,
        ...options.headers,
      }),
      reset: options.disableKeepAlive ?? false,
      bodyTimeout: Object.hasOwn(options, "timeout")
        ? options.timeout
        : DEFAULT_OPTIONS.timeout,
      headersTimeout: Object.hasOwn(options, "timeout")
        ? options.timeout
        : DEFAULT_OPTIONS.timeout,
      throwOnError: false,
    },
    resolveRetryConfig(options),
    resolveRequestConfig(options),
  );

  return resolveResult(
    result,
    options.throwOnError ?? DEFAULT_OPTIONS.throwOnError,
    options.validateResponse ?? DEFAULT_OPTIONS.validateResponse,
    options.responseSchema,
    options.requestLabel,
    options.isEmptyResponseExpected ?? true,
  );
}

export async function sendPut<
  T,
  IsEmptyResponseExpected extends boolean = true,
>(
  client: Client,
  path: string,
  body: RecordObject | undefined,
  options: RequestOptions<T, IsEmptyResponseExpected>,
): Promise<RequestResultDefinitiveEither<T, IsEmptyResponseExpected>> {
  const result = await sendWithRetry<T>(
    client,
    {
      ...DEFAULT_OPTIONS,
      path: path,
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
      query: options.query,
      headers: copyWithoutUndefined({
        "x-request-id": options.reqContext?.reqId,
        ...options.headers,
      }),
      reset: options.disableKeepAlive ?? false,
      bodyTimeout: Object.hasOwn(options, "timeout")
        ? options.timeout
        : DEFAULT_OPTIONS.timeout,
      headersTimeout: Object.hasOwn(options, "timeout")
        ? options.timeout
        : DEFAULT_OPTIONS.timeout,
      throwOnError: false,
    },
    resolveRetryConfig(options),
    resolveRequestConfig(options),
  );

  return resolveResult(
    result,
    options.throwOnError ?? DEFAULT_OPTIONS.throwOnError,
    options.validateResponse ?? DEFAULT_OPTIONS.validateResponse,
    options.responseSchema,
    options.requestLabel,
    options.isEmptyResponseExpected ?? true,
  );
}

export async function sendPutBinary<
  T,
  IsEmptyResponseExpected extends boolean = true,
>(
  client: Client,
  path: string,
  body: Buffer | Uint8Array | Readable | FormData | null,
  options: RequestOptions<T, IsEmptyResponseExpected>,
): Promise<RequestResultDefinitiveEither<T, IsEmptyResponseExpected>> {
  const result = await sendWithRetry<T>(
    client,
    {
      ...DEFAULT_OPTIONS,
      path: path,
      method: "PUT",
      body,
      query: options.query,
      headers: copyWithoutUndefined({
        "x-request-id": options.reqContext?.reqId,
        ...options.headers,
      }),
      reset: options.disableKeepAlive ?? false,
      bodyTimeout: Object.hasOwn(options, "timeout")
        ? options.timeout
        : DEFAULT_OPTIONS.timeout,
      headersTimeout: Object.hasOwn(options, "timeout")
        ? options.timeout
        : DEFAULT_OPTIONS.timeout,
      throwOnError: false,
    },
    resolveRetryConfig(options),
    resolveRequestConfig(options),
  );

  return resolveResult(
    result,
    options.throwOnError ?? DEFAULT_OPTIONS.throwOnError,
    options.validateResponse ?? DEFAULT_OPTIONS.validateResponse,
    options.responseSchema,
    options.requestLabel,
    options.isEmptyResponseExpected ?? true,
  );
}

export async function sendPatch<
  T,
  IsEmptyResponseExpected extends boolean = true,
>(
  client: Client,
  path: string,
  body: RecordObject | undefined,
  options: RequestOptions<T, IsEmptyResponseExpected>,
): Promise<RequestResultDefinitiveEither<T, IsEmptyResponseExpected>> {
  const result = await sendWithRetry<T>(
    client,
    {
      ...DEFAULT_OPTIONS,
      path: path,
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
      query: options.query,
      headers: copyWithoutUndefined({
        "x-request-id": options.reqContext?.reqId,
        ...options.headers,
      }),
      reset: options.disableKeepAlive ?? false,
      bodyTimeout: Object.hasOwn(options, "timeout")
        ? options.timeout
        : DEFAULT_OPTIONS.timeout,
      headersTimeout: Object.hasOwn(options, "timeout")
        ? options.timeout
        : DEFAULT_OPTIONS.timeout,
      throwOnError: false,
    },
    resolveRetryConfig(options),
    resolveRequestConfig(options),
  );

  return resolveResult(
    result,
    options.throwOnError ?? DEFAULT_OPTIONS.throwOnError,
    options.validateResponse ?? DEFAULT_OPTIONS.validateResponse,
    options.responseSchema,
    options.requestLabel,
    options.isEmptyResponseExpected ?? true,
  );
}

function resolveRequestConfig(
  options: InternalRequestOptions<unknown>,
): RequestParams {
  return {
    safeParseJson: options.safeParseJson ?? false,
    blobBody: options.blobResponseBody ?? false,
    throwOnInternalError: false,
    requestLabel: options.requestLabel,
  };
}

function resolveRetryConfig(
  options: InternalRequestOptions<unknown>,
): RetryConfig {
  return options.retryConfig ?? NO_RETRY_CONFIG;
}

function resolveResult<T, IsEmptyResponseExpected extends boolean>(
  requestResult: Either<
    RequestResult<unknown> | InternalRequestError,
    RequestResult<T>
  >,
  throwOnError: boolean,
  validateResponse: boolean,
  validationSchema: ZodSchema<T>,
  requestLabel: string,
  isEmptyResponseExpected: boolean,
): RequestResultDefinitiveEither<T, IsEmptyResponseExpected> {
  // Throw response error
  if (requestResult.error && throwOnError) {
    throw isRequestResult(requestResult.error)
      ? new ResponseStatusError(requestResult.error, requestLabel)
      : requestResult.error;
  }

  if (requestResult.result) {
    requestResult.result = handleRequestResultSuccess(
      requestResult.result,
      validateResponse,
      validationSchema,
      requestLabel,
      isEmptyResponseExpected,
    );
  }

  return requestResult as RequestResultDefinitiveEither<
    T,
    IsEmptyResponseExpected
  >;
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
    result.body = null;
    return result;
  }

  if (validateResponse) {
    try {
      result.body = validationSchema.parse(result.body);
    } catch (err: unknown) {
      for (const issue of (err as ZodError).issues) {
        // @ts-ignore
        issue.requestLabel = requestLabel;
      }
      // @ts-ignore
      err.requestLabel = requestLabel;
      throw err;
    }
  }

  return result;
}

export const httpClient = {
  get: sendGet,
  post: sendPost,
  put: sendPut,
  patch: sendPatch,
  del: sendDelete,
};
