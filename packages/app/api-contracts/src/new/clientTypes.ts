import type { z } from 'zod/v4'
import type { InferSchemaInput, InferSchemaOutput } from '../apiContracts.ts'
import type {
  ExpandStatusRangeKey,
  HttpStatusCode,
  HttpStatusCodeRange,
  SuccessfulHttpStatusCode,
  WildcardStatusCodeKey,
} from '../HttpStatusCodes.ts'
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
    ? Omit<Record<string, string>, keyof InferSchemaOutput<TApiContract['responseHeaderSchema']>> &
        InferSchemaOutput<TApiContract['responseHeaderSchema']>
    : Record<string, string>

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

// Body helpers for non-'default' wildcard range keys (e.g. '2xx', '4xx', '5xx').
// '2xx' maps to success mode (SSE-filtered or non-SSE-filtered); all other ranges use the full body
// union because non-2xx range entries always land on the error side of captureAsError.
// 'default' does not use these helpers — it inlines its own body logic in WildcardSseEntry /
// WildcardNonSseEntry, where the success half is still SSE/non-SSE filtered and the non-success
// half uses the full body union.
type WildcardSseBody<V, K extends WildcardStatusCodeKey> = K extends '2xx'
  ? SseInferClientResponseBody<V>
  : InferClientResponseBody<V>

type WildcardNonSseBody<V, K extends WildcardStatusCodeKey> = K extends '2xx'
  ? NonSseInferClientResponseBody<V>
  : InferClientResponseBody<V>

// Exact status codes explicitly defined in the contract — these take precedence over range keys.
type ExactStatusCodes<TApiContract extends ApiContract> =
  keyof TApiContract['responsesByStatusCode'] & HttpStatusCode

// Status codes covered by any range key (e.g. '2xx', '4xx') present in the contract.
// These take precedence over 'default'.
type RangeStatusCodes<TApiContract extends ApiContract> = {
  [K in keyof TApiContract['responsesByStatusCode'] & HttpStatusCodeRange]: ExpandStatusRangeKey<K>
}[keyof TApiContract['responsesByStatusCode'] & HttpStatusCodeRange]

// Status codes that fall through to 'default' — not claimed by any exact code or range key.
// Split into success/non-success so captureAsError typing stays accurate: success lands in
// Either.result, non-success lands in Either.error.
type DefaultSuccessStatusCodes<TApiContract extends ApiContract> = Exclude<
  SuccessfulHttpStatusCode,
  ExactStatusCodes<TApiContract> | RangeStatusCodes<TApiContract>
>
type DefaultNonSuccessStatusCodes<TApiContract extends ApiContract> = Exclude<
  Exclude<HttpStatusCode, SuccessfulHttpStatusCode>,
  ExactStatusCodes<TApiContract> | RangeStatusCodes<TApiContract>
>

type WildcardSseEntry<
  TApiContract extends ApiContract,
  K extends WildcardStatusCodeKey,
> = K extends 'default'
  ?
      | {
          statusCode: DefaultSuccessStatusCodes<TApiContract>
          headers: InferClientResponseHeaders<TApiContract>
          body: SseInferClientResponseBody<NonNullable<TApiContract['responsesByStatusCode'][K]>>
        }
      | {
          statusCode: DefaultNonSuccessStatusCodes<TApiContract>
          headers: InferClientResponseHeaders<TApiContract>
          body: InferClientResponseBody<NonNullable<TApiContract['responsesByStatusCode'][K]>>
        }
  : {
      statusCode: Exclude<ExpandStatusRangeKey<K>, ExactStatusCodes<TApiContract>>
      headers: InferClientResponseHeaders<TApiContract>
      body: WildcardSseBody<NonNullable<TApiContract['responsesByStatusCode'][K]>, K>
    }

type WildcardNonSseEntry<
  TApiContract extends ApiContract,
  K extends WildcardStatusCodeKey,
> = K extends 'default'
  ?
      | {
          statusCode: DefaultSuccessStatusCodes<TApiContract>
          headers: InferClientResponseHeaders<TApiContract>
          body: NonSseInferClientResponseBody<NonNullable<TApiContract['responsesByStatusCode'][K]>>
        }
      | {
          statusCode: DefaultNonSuccessStatusCodes<TApiContract>
          headers: InferClientResponseHeaders<TApiContract>
          body: InferClientResponseBody<NonNullable<TApiContract['responsesByStatusCode'][K]>>
        }
  : {
      statusCode: Exclude<ExpandStatusRangeKey<K>, ExactStatusCodes<TApiContract>>
      headers: InferClientResponseHeaders<TApiContract>
      body: WildcardNonSseBody<NonNullable<TApiContract['responsesByStatusCode'][K]>, K>
    }

/**
 * Infers a discriminated union of `{ statusCode, headers, body }` for SSE mode:
 * - exact success status codes and `'2xx'` range → SSE body only (AsyncIterable)
 * - error status codes, other ranges, and `'default'` → body as-is (all kinds)
 *
 * `'default'` is split into a success half (`SuccessfulHttpStatusCode`) and a non-success half
 * so that `captureAsError` type narrowing stays correct regardless of the actual status code.
 *
 * Headers are typed via `InferClientResponseHeaders`: known headers from `responseHeaderSchema`
 * are strongly typed; all other headers remain accessible as `string | undefined`.
 */
export type InferSseClientResponse<TApiContract extends ApiContract> =
  | {
      [K in keyof TApiContract['responsesByStatusCode'] & HttpStatusCode]: {
        statusCode: K
        headers: InferClientResponseHeaders<TApiContract>
        body: K extends SuccessfulHttpStatusCode
          ? SseInferClientResponseBody<NonNullable<TApiContract['responsesByStatusCode'][K]>>
          : InferClientResponseBody<NonNullable<TApiContract['responsesByStatusCode'][K]>>
      }
    }[keyof TApiContract['responsesByStatusCode'] & HttpStatusCode]
  | {
      [K in keyof TApiContract['responsesByStatusCode'] & WildcardStatusCodeKey]: WildcardSseEntry<
        TApiContract,
        K
      >
    }[keyof TApiContract['responsesByStatusCode'] & WildcardStatusCodeKey]

/**
 * Infers a discriminated union of `{ statusCode, headers, body }` for non-SSE mode:
 * - exact success status codes and `'2xx'` range → non-SSE body only (JSON / text / blob / null)
 * - error status codes, other ranges, and `'default'` → body as-is (all kinds)
 *
 * `'default'` is split into a success half (`SuccessfulHttpStatusCode`) and a non-success half
 * so that `captureAsError` type narrowing stays correct regardless of the actual status code.
 *
 * Headers are typed via `InferClientResponseHeaders`: known headers from `responseHeaderSchema`
 * are strongly typed; all other headers remain accessible as `string | undefined`.
 */
export type InferNonSseClientResponse<TApiContract extends ApiContract> =
  | {
      [K in keyof TApiContract['responsesByStatusCode'] & HttpStatusCode]: {
        statusCode: K
        headers: InferClientResponseHeaders<TApiContract>
        body: K extends SuccessfulHttpStatusCode
          ? NonSseInferClientResponseBody<NonNullable<TApiContract['responsesByStatusCode'][K]>>
          : InferClientResponseBody<NonNullable<TApiContract['responsesByStatusCode'][K]>>
      }
    }[keyof TApiContract['responsesByStatusCode'] & HttpStatusCode]
  | {
      [K in keyof TApiContract['responsesByStatusCode'] &
        WildcardStatusCodeKey]: WildcardNonSseEntry<TApiContract, K>
    }[keyof TApiContract['responsesByStatusCode'] & WildcardStatusCodeKey]
