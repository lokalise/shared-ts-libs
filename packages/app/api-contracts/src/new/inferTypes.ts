import type { z } from 'zod/v4'
import type { SuccessfulHttpStatusCode } from '../HttpStatusCodes.ts'
import type { ValueOf } from '../typeUtils.ts'
import type { ContractNoBody } from './constants.ts'
import type { ResponsesByStatusCode } from './contractResponse.ts'

type ExtractSuccessResponses<T extends ResponsesByStatusCode> = ValueOf<
  T,
  Extract<keyof T, SuccessfulHttpStatusCode>
>

/**
 * Returns true if all success responses have no body (ContractNoBody or no success status codes defined).
 */
export type IsNoBodySuccessResponse<T extends ResponsesByStatusCode> = [
  ExtractSuccessResponses<T>,
] extends [typeof ContractNoBody | undefined]
  ? true
  : false

type UnpackAnyOf<T> = T extends { _tag: 'AnyOfResponses'; responses: Array<infer Item> } ? Item : T

type FlatSuccessResponses<T extends ResponsesByStatusCode> = UnpackAnyOf<ExtractSuccessResponses<T>>

type SseSchemaOf<T> = T extends { _tag: 'SseResponse'; schemaByEventName: infer S } ? S : never

/**
 * Extracts the merged SSE event schema map from a responsesByStatusCode map.
 * Returns the union of all `schemaByEventName` objects from TypedSseResponse entries,
 * including those nested inside AnyOfResponses.
 */
export type InferSseSuccessResponses<T extends ResponsesByStatusCode> = SseSchemaOf<
  FlatSuccessResponses<T>
>

/**
 * Returns true if any success status code entry is a JSON Zod schema,
 * or an AnyOfResponses containing one.
 */
export type HasAnyJsonSuccessResponse<T extends ResponsesByStatusCode> =
  Extract<FlatSuccessResponses<T>, z.ZodType> extends never ? false : true

type JsonSchemaOf<T> = T extends z.ZodType ? T : never

/**
 * Extracts the union of JSON Zod schemas from all success responses,
 * including those nested inside AnyOfResponses. Text, Blob, and SSE responses are excluded.
 */
export type InferJsonSuccessResponses<T extends ResponsesByStatusCode> = JsonSchemaOf<
  FlatSuccessResponses<T>
>

type NonSseBodyOf<T> = T extends { _tag: 'SseResponse' }
  ? never
  : T extends { _tag: 'BlobResponse' }
    ? Blob
    : T extends { _tag: 'TextResponse' }
      ? string
      : T extends z.ZodType
        ? z.output<T>
        : undefined

/**
 * Infers the TypeScript output type of all non-SSE success responses.
 * JSON schemas → z.output<T>. TextResponse → string. BlobResponse → Blob.
 * ContractNoBody → undefined. SseResponse → never (excluded).
 * AnyOfResponses are unpacked before mapping.
 */
export type InferNonSseSuccessResponses<T extends ResponsesByStatusCode> = NonSseBodyOf<
  FlatSuccessResponses<T>
>

/**
 * Discriminated union of SSE events inferred from a schemaByEventName map.
 * Each event is `{ event: EventName, data: z.output<Schema> }`.
 */
export type SseEventOf<S> = {
  [K in keyof S]: K extends string
    ? { event: K; data: S[K] extends z.ZodType ? z.output<S[K]> : never }
    : never
}[keyof S]

/**
 * Returns true if any success status code entry is TypedSseResponse,
 * or an AnyOfResponses containing a TypedSseResponse.
 */
export type HasAnySseSuccessResponse<T extends ResponsesByStatusCode> =
  Extract<FlatSuccessResponses<T>, { _tag: 'SseResponse' }> extends never ? false : true

/**
 * Returns true if any success status code entry has a non-SSE response
 * (JSON, text, blob, or no-body). Mirrors HasAnySseSuccessResponse.
 */
export type HasAnyNonSseSuccessResponse<T extends ResponsesByStatusCode> =
  Exclude<FlatSuccessResponses<T>, { _tag: 'SseResponse' }> extends never ? false : true

/**
 * Classifies a contract's response mode into one of three cases:
 * - 'dual'    — SSE + non-SSE success responses; caller chooses via streaming param
 * - 'sse'     — SSE-only success responses; always streams
 * - 'non-sse' — JSON / text / blob / no-body; never streams
 */
export type ContractResponseMode<T extends ResponsesByStatusCode> =
  HasAnySseSuccessResponse<T> extends true
    ? HasAnyNonSseSuccessResponse<T> extends true
      ? 'dual'
      : 'sse'
    : 'non-sse'

/**
 * Union of response mode literals available for a given responsesByStatusCode map.
 */
export type AvailableResponseModes<T extends ResponsesByStatusCode> =
  | (HasAnyJsonSuccessResponse<T> extends true ? 'json' : never)
  | (HasAnySseSuccessResponse<T> extends true ? 'sse' : never)
  | (Extract<FlatSuccessResponses<T>, { _tag: 'BlobResponse' }> extends never ? never : 'blob')
  | (Extract<FlatSuccessResponses<T>, { _tag: 'TextResponse' }> extends never ? never : 'text')
  | (Extract<FlatSuccessResponses<T>, typeof ContractNoBody> extends never ? never : 'noContent')
