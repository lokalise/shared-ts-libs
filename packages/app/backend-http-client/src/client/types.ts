import type { DefiniteEither } from '@lokalise/node-core'
import type { Client } from 'undici'
import type { Either, InternalRequestError, RequestResult, RetryConfig } from 'undici-retry'
import type { ZodSchema } from 'zod/v3'

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export type RecordObject = Record<string, any>

export type HttpRequestContext = {
  reqId: string
}

export function isInternalRequestError(error: unknown): error is InternalRequestError {
  return (error as InternalRequestError).isInternalRequestError === true
}

export type InternalRequestOptions<T> = {
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
  responseSchema: ZodSchema<T>
  validateResponse?: boolean
}

export type RequestOptions<
  T,
  IsEmptyResponseExpected extends boolean,
  DoThrowOnError extends boolean,
> = InternalRequestOptions<T> & {
  isEmptyResponseExpected?: IsEmptyResponseExpected
  throwOnError?: DoThrowOnError
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
