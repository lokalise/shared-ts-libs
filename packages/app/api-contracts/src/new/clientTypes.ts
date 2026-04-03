import type { z } from 'zod/v4'
import type { InferSchemaInput, InferSchemaOutput } from '../apiContracts.ts'
import type { HttpStatusCode, SuccessfulHttpStatusCode } from '../HttpStatusCodes.ts'
import type { Prettify } from '../typeUtils.ts'
import type { ContractNoBody } from './constants.ts'
import type { ResponsesByStatusCode, SseSchemaByEventName } from './contractResponse.ts'
import type { ApiContract } from './defineApiContract.ts'
import type { ContractResponseMode, SseEventOf } from './inferTypes.ts'

export type HeadersParam<T> = T | (() => T) | (() => Promise<T>)

type ExtractRequestBody<T> = T extends { requestBodySchema: z.ZodType }
  ? T['requestBodySchema']
  : undefined

// streaming param: required for dual-mode, forbidden otherwise
type StreamingParam<T extends ResponsesByStatusCode, TIsStreaming extends boolean> =
  ContractResponseMode<T> extends 'dual' ? { streaming: TIsStreaming } : { streaming?: never }

// SSE-only contracts default IsStreaming to true; everything else to false
export type DefaultStreaming<T extends ResponsesByStatusCode> =
  ContractResponseMode<T> extends 'sse' ? true : false

type RequiredWhenDefined<T, TKey extends string, TExtra = T> = [T] extends [undefined]
  ? { [K in TKey]?: undefined }
  : { [K in TKey]: TExtra }

export type ClientRequestParams<
  TApiContract extends ApiContract,
  TIsStreaming extends boolean,
> = Prettify<
  StreamingParam<TApiContract['responsesByStatusCode'], TIsStreaming> &
    RequiredWhenDefined<InferSchemaInput<TApiContract['requestPathParamsSchema']>, 'pathParams'> &
    RequiredWhenDefined<InferSchemaInput<ExtractRequestBody<TApiContract>>, 'body'> &
    RequiredWhenDefined<InferSchemaInput<TApiContract['requestQuerySchema']>, 'queryParams'> &
    RequiredWhenDefined<
      InferSchemaInput<TApiContract['requestHeaderSchema']>,
      'headers',
      HeadersParam<InferSchemaInput<TApiContract['requestHeaderSchema']>>
    > & { pathPrefix?: string }
>

type InferClientResponseHeaders<TApiContract extends ApiContract> =
  TApiContract['responseHeaderSchema'] extends z.ZodType
    ? InferSchemaOutput<TApiContract['responseHeaderSchema']> & Record<string, string | undefined>
    : Record<string, string | undefined>

/**
 * Maps a single responsesByStatusCode entry value to its TypeScript body type.
 */
type InferClientResponseBody<T> = T extends typeof ContractNoBody
  ? null
  : T extends z.ZodType
    ? InferSchemaOutput<T>
    : T extends { _tag: 'TextResponse' }
      ? string
      : T extends { _tag: 'BlobResponse' }
        ? Blob
        : T extends { _tag: 'SseResponse'; schemaByEventName: infer S extends SseSchemaByEventName }
          ? AsyncIterable<SseEventOf<S>>
          : T extends { _tag: 'AnyOfResponses'; responses: Array<infer Item> }
            ? InferClientResponseBody<Item>
            : never

/**
 * Like InferClientResponseBody but returns only SSE bodies — non-SSE entries resolve to never.
 */
type SseInferClientResponseBody<T> = Extract<InferClientResponseBody<T>, AsyncIterable<unknown>>

/**
 * Like InferClientResponseBody but returns only non-SSE bodies — SSE entries resolve to never.
 */
type NonSseInferClientResponseBody<T> = Exclude<InferClientResponseBody<T>, AsyncIterable<unknown>>

/**
 * Infers a discriminated union of `{ statusCode, headers, body }` for SSE mode:
 * - success status codes → SSE body only (AsyncIterable)
 * - error status codes  → body as-is (all kinds)
 *
 * Headers are typed via `InferClientResponseHeaders`: known headers from `responseHeaderSchema`
 * are strongly typed; all other headers remain accessible as `string | undefined`.
 */
export type InferSseClientResponse<TApiContract extends ApiContract> = {
  [K in keyof TApiContract['responsesByStatusCode'] & HttpStatusCode]: {
    statusCode: K
    headers: InferClientResponseHeaders<TApiContract>
    body: K extends SuccessfulHttpStatusCode
      ? SseInferClientResponseBody<NonNullable<TApiContract['responsesByStatusCode'][K]>>
      : InferClientResponseBody<NonNullable<TApiContract['responsesByStatusCode'][K]>>
  }
}[keyof TApiContract['responsesByStatusCode'] & HttpStatusCode]

/**
 * Infers a discriminated union of `{ statusCode, headers, body }` for non-SSE mode:
 * - success status codes → non-SSE body only (JSON / text / blob / null)
 * - error status codes  → body as-is (all kinds)
 *
 * Headers are typed via `InferClientResponseHeaders`: known headers from `responseHeaderSchema`
 * are strongly typed; all other headers remain accessible as `string | undefined`.
 */
export type InferNonSseClientResponse<TApiContract extends ApiContract> = {
  [K in keyof TApiContract['responsesByStatusCode'] & HttpStatusCode]: {
    statusCode: K
    headers: InferClientResponseHeaders<TApiContract>
    body: K extends SuccessfulHttpStatusCode
      ? NonSseInferClientResponseBody<NonNullable<TApiContract['responsesByStatusCode'][K]>>
      : InferClientResponseBody<NonNullable<TApiContract['responsesByStatusCode'][K]>>
  }
}[keyof TApiContract['responsesByStatusCode'] & HttpStatusCode]
