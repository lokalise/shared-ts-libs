import type { DefiniteEither } from '@lokalise/node-core'
import type { Client } from 'undici'
import type { RequestResult, RetryConfig } from 'undici-retry'
import type { ZodSchema } from 'zod'

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export type RecordObject = Record<string, any>

export type HttpRequestContext = {
  reqId: string
}

export type InternalRequestOptions<T> = {
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
  responseSchema: ZodSchema<T>
  validateResponse?: boolean
}

export type RequestOptions<
  T,
  IsEmptyResponseExpected extends boolean,
> = InternalRequestOptions<T> & {
  isEmptyResponseExpected?: IsEmptyResponseExpected
}

export type RequestResultDefinitiveEither<
  T,
  IsEmptyResponseExpected extends boolean,
> = DefiniteEither<
  RequestResult<unknown>,
  IsEmptyResponseExpected extends true ? RequestResult<T | null> : RequestResult<T>
>
