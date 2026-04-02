import type { DefiniteEither } from '@lokalise/node-core'
import type { Client } from 'undici'
import type { Either, InternalRequestError, RequestResult, RetryConfig } from 'undici-retry'
import type { ZodSchema } from 'zod/v4'

// biome-ignore lint/suspicious/noExplicitAny: ok
export type RecordObject = Record<string, any>

export type HttpRequestContext = {
  reqId: string
}

export function isInternalRequestError(error: unknown): error is InternalRequestError {
  return (error as InternalRequestError).isInternalRequestError === true
}

export type InternalRequestOptions<T extends ZodSchema | undefined> = {
  headers?: RecordObject
  query?: RecordObject
  timeout?: number | null
  reqContext?: HttpRequestContext

  safeParseJson?: boolean
  blobResponseBody?: boolean
  requestLabel: string

  disableKeepAlive?: boolean
  retryConfig?: RetryConfig
  clientOptions?: Client.Options
  responseSchema: T
  validateResponse?: boolean
}

export type RequestOptions<
  T extends ZodSchema | undefined,
  IsEmptyResponseExpected extends boolean,
  DoThrowOnError extends boolean,
> = InternalRequestOptions<T> & {
  isEmptyResponseExpected?: IsEmptyResponseExpected
  throwOnError?: DoThrowOnError
}

export type ContractRequestOptions<DoCaptureAsError extends boolean = boolean> = {
  reqContext?: HttpRequestContext
  requestLabel: string
  disableKeepAlive?: boolean
  retryConfig?: RetryConfig
  /**
   * When true (default), the response body is validated against the contract schema.
   * When false, the body is returned as-is without validation.
   */
  validateResponse?: boolean
  /**
   * When true (default), non-success HTTP responses are mapped to Either.error.
   * When false, all HTTP responses are returned in Either.result regardless of status code.
   */
  captureAsError?: DoCaptureAsError
  signal?: AbortSignal
  /**
   * When true (default), throws if the response content-type doesn't match the contract entry.
   * When false, falls back to the contract entry's kind when content-type is absent or mismatched —
   * only applies to single-entry responses (not anyOfResponses).
   */
  strictContentType?: boolean
}

export type RequestResultDefinitiveEither<
  T,
  IsEmptyResponseExpected extends boolean,
  DoThrowOnError extends boolean,
> = DoThrowOnError extends true
  ? DefiniteEither<
      RequestResult<unknown>,
      IsEmptyResponseExpected extends true ? RequestResult<T | null> : RequestResult<T>
    >
  : Either<
      RequestResult<unknown> | InternalRequestError,
      IsEmptyResponseExpected extends true ? RequestResult<T | null> : RequestResult<T>
    >
