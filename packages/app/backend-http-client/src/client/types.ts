import type { DefiniteEither, Either } from '@lokalise/node-core'
import type { Client, Dispatcher, Pool } from 'undici'
import type { ZodSchema } from 'zod/v4'
import type { RetryConfig } from '../api-contract/retry.ts'
import type { InternalRequestError } from '../errors/InternalRequestError.ts'

// biome-ignore lint/suspicious/noExplicitAny: ok
export type RecordObject = Record<string, any>

/**
 * What the request helpers send through: a `Client` from `buildClient` or a `Pool` from
 * `buildPool`. Type a parameter that takes either with this instead of importing from `undici`
 * directly, so the undici major version stays an implementation detail of this package.
 */
export type HttpDispatcher = Client | Pool

export type HttpRequestContext = {
  reqId: string
}

export type RequestResult<T> = {
  body: T
  headers: Dispatcher.ResponseData['headers']
  statusCode: number
  requestLabel?: string
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
  retryConfig?: RetryConfig | true
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
