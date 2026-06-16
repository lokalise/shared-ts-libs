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
 * Both no-body forms (the ContractNoBody symbol and tagged noBodyResponse()) map to null.
 */
type InferClientResponseBody<T> = T extends typeof ContractNoBody
  ? null
  : T extends { _tag: 'NoBodyResponse' }
    ? null
    : T extends z.ZodType
      ? InferSchemaOutput<T>
      : T extends { _tag: 'TextResponse' }
        ? string
        : T extends { _tag: 'BlobResponse' }
          ? Blob
          : T extends {
                _tag: 'SseResponse'
                schemaByEventName: infer S extends SseSchemaByEventName
              }
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

// ─── Content-map entry support (newer style) ───
// Old per-status values yield a legacy `{ statusCode, headers, body }` member (no contentType).
// Content-map entries instead yield one `{ statusCode, contentType, headers, body }` member per
// media type, plus a no-body member (`contentType?: undefined; body: null`) when `allowNoBody` is set.

type InferContentDescriptorBody<TDescriptor> = TDescriptor extends { _tag: 'BlobBody' }
  ? Blob
  : TDescriptor extends { _tag: 'SseBody'; schemaByEventName: infer S extends SseSchemaByEventName }
    ? AsyncIterable<SseEventOf<S>>
    : TDescriptor extends z.ZodType
      ? InferSchemaOutput<TDescriptor>
      : never

type ContentEntryVariants<TEntry> =
  | (TEntry extends { content: infer C }
      ? {
          [CT in keyof C & string]: { contentType: CT; body: InferContentDescriptorBody<C[CT]> }
        }[keyof C & string]
      : never)
  | (TEntry extends { allowNoBody: true } ? { contentType?: undefined; body: null } : never)

type IsContentEntry<V> = V extends { content: object }
  ? true
  : V extends { allowNoBody: true }
    ? true
    : false

type SseContentVariants<TEntry> = Extract<
  ContentEntryVariants<TEntry>,
  { body: AsyncIterable<unknown> }
>
type NonSseContentVariants<TEntry> = Exclude<
  ContentEntryVariants<TEntry>,
  { body: AsyncIterable<unknown> }
>

/** Response mode for a given status class: success codes filter by SSE/non-SSE; others pass all. */
type ResponseBodyMode = 'sse' | 'non-sse' | 'all'

type ContentVariantsForMode<TEntry, TMode extends ResponseBodyMode> = TMode extends 'sse'
  ? SseContentVariants<TEntry>
  : TMode extends 'non-sse'
    ? NonSseContentVariants<TEntry>
    : ContentEntryVariants<TEntry>

type LegacyBodyForMode<V, TMode extends ResponseBodyMode> = TMode extends 'sse'
  ? SseInferClientResponseBody<V>
  : TMode extends 'non-sse'
    ? NonSseInferClientResponseBody<V>
    : InferClientResponseBody<V>

/** Attaches `statusCode` + `headers` to each `{ contentType, body }` variant. */
type WithMeta<TStatusCode, THeaders, TVariant> = TVariant extends unknown
  ? Prettify<{ statusCode: TStatusCode; headers: THeaders } & TVariant>
  : never

/**
 * Builds the response union member(s) for a status code `K` holding value `V`.
 * Content-map entries expand to contentType-tagged variants; legacy entries keep the original
 * `{ statusCode, headers, body }` shape (so existing contracts are byte-for-byte unchanged).
 */
type ResponseMember<TStatusCode, THeaders, V, TMode extends ResponseBodyMode> =
  IsContentEntry<V> extends true
    ? WithMeta<TStatusCode, THeaders, ContentVariantsForMode<V, TMode>>
    : { statusCode: TStatusCode; headers: THeaders; body: LegacyBodyForMode<V, TMode> }

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
      | ResponseMember<
          DefaultSuccessStatusCodes<TApiContract>,
          InferClientResponseHeaders<TApiContract>,
          NonNullable<TApiContract['responsesByStatusCode'][K]>,
          'sse'
        >
      | ResponseMember<
          DefaultNonSuccessStatusCodes<TApiContract>,
          InferClientResponseHeaders<TApiContract>,
          NonNullable<TApiContract['responsesByStatusCode'][K]>,
          'all'
        >
  : ResponseMember<
      Exclude<ExpandStatusRangeKey<K>, ExactStatusCodes<TApiContract>>,
      InferClientResponseHeaders<TApiContract>,
      NonNullable<TApiContract['responsesByStatusCode'][K]>,
      K extends '2xx' ? 'sse' : 'all'
    >

type WildcardNonSseEntry<
  TApiContract extends ApiContract,
  K extends WildcardStatusCodeKey,
> = K extends 'default'
  ?
      | ResponseMember<
          DefaultSuccessStatusCodes<TApiContract>,
          InferClientResponseHeaders<TApiContract>,
          NonNullable<TApiContract['responsesByStatusCode'][K]>,
          'non-sse'
        >
      | ResponseMember<
          DefaultNonSuccessStatusCodes<TApiContract>,
          InferClientResponseHeaders<TApiContract>,
          NonNullable<TApiContract['responsesByStatusCode'][K]>,
          'all'
        >
  : ResponseMember<
      Exclude<ExpandStatusRangeKey<K>, ExactStatusCodes<TApiContract>>,
      InferClientResponseHeaders<TApiContract>,
      NonNullable<TApiContract['responsesByStatusCode'][K]>,
      K extends '2xx' ? 'non-sse' : 'all'
    >

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
      [K in keyof TApiContract['responsesByStatusCode'] & HttpStatusCode]: ResponseMember<
        K,
        InferClientResponseHeaders<TApiContract>,
        NonNullable<TApiContract['responsesByStatusCode'][K]>,
        K extends SuccessfulHttpStatusCode ? 'sse' : 'all'
      >
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
      [K in keyof TApiContract['responsesByStatusCode'] & HttpStatusCode]: ResponseMember<
        K,
        InferClientResponseHeaders<TApiContract>,
        NonNullable<TApiContract['responsesByStatusCode'][K]>,
        K extends SuccessfulHttpStatusCode ? 'non-sse' : 'all'
      >
    }[keyof TApiContract['responsesByStatusCode'] & HttpStatusCode]
  | {
      [K in keyof TApiContract['responsesByStatusCode'] &
        WildcardStatusCodeKey]: WildcardNonSseEntry<TApiContract, K>
    }[keyof TApiContract['responsesByStatusCode'] & WildcardStatusCodeKey]
