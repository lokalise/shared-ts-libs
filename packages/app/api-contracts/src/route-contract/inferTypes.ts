import type { z } from 'zod/v4'
import type { SuccessfulHttpStatusCode } from '../HttpStatusCodes.ts'
import type { IsUnion, ValueOf } from '../typeUtils.ts'
import type { ContractNoBodyType } from './constants.ts'
import type { ResponseSchemasByStatusCode } from './contractResponse.ts'

type ExtractSuccessResponses<T extends ResponseSchemasByStatusCode> = ValueOf<
  T,
  Extract<keyof T, SuccessfulHttpStatusCode>
>

/**
 * Returns true if all success responses have no body (ContractNoBody or no success status codes defined).
 */
export type IsNoBodySuccessResponse<T extends ResponseSchemasByStatusCode> = [
  ExtractSuccessResponses<T>,
] extends [ContractNoBodyType | undefined]
  ? true
  : false

type UnpackAnyOf<T> = T extends { _tag: 'AnyOfResponses'; responses: Array<infer Item> } ? Item : T

type FlatSuccessResponses<T extends ResponseSchemasByStatusCode> = UnpackAnyOf<
  ExtractSuccessResponses<T>
>

/**
 * Returns true if any success status code entry is TypedSseResponse,
 * or an AnyOfResponses containing a TypedSseResponse.
 */
export type HasAnySseSuccessResponse<T extends ResponseSchemasByStatusCode> =
  Extract<FlatSuccessResponses<T>, { _tag: 'SseResponse' }> extends never ? false : true

type SseSchemaOf<T> = T extends { _tag: 'SseResponse'; schemaByEventName: infer S } ? S : never

/**
 * Extracts the merged SSE event schema map from a responseSchemasByStatusCode map.
 * Returns the union of all `schemaByEventName` objects from TypedSseResponse entries,
 * including those nested inside AnyOfResponses.
 */
export type InferSseSuccessResponses<T extends ResponseSchemasByStatusCode> = SseSchemaOf<
  FlatSuccessResponses<T>
>

/**
 * Returns true if any success status code entry is a JSON Zod schema,
 * or an AnyOfResponses containing one.
 */
export type HasAnyJsonSuccessResponse<T extends ResponseSchemasByStatusCode> =
  Extract<FlatSuccessResponses<T>, z.ZodType> extends never ? false : true

type JsonSchemaOf<T> = T extends z.ZodType ? T : never

/**
 * Extracts the union of JSON Zod schemas from all success responses,
 * including those nested inside AnyOfResponses. Text, Blob, and SSE responses are excluded.
 */
export type InferJsonSuccessResponses<T extends ResponseSchemasByStatusCode> = JsonSchemaOf<
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
export type InferNonSseSuccessResponses<T extends ResponseSchemasByStatusCode> = NonSseBodyOf<
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
 * True when the contract has both SSE and non-SSE success responses (dual-mode).
 */
export type IsDualModeSse<T extends ResponseSchemasByStatusCode> =
  HasAnySseSuccessResponse<T> extends true
    ? IsUnion<AvailableResponseModes<T>> extends true
      ? true
      : false
    : false

/**
 * Union of response mode literals available for a given responseSchemasByStatusCode map.
 */
export type AvailableResponseModes<T extends ResponseSchemasByStatusCode> =
  | (HasAnyJsonSuccessResponse<T> extends true ? 'json' : never)
  | (HasAnySseSuccessResponse<T> extends true ? 'sse' : never)
  | (Extract<FlatSuccessResponses<T>, { _tag: 'BlobResponse' }> extends never ? never : 'blob')
  | (Extract<FlatSuccessResponses<T>, { _tag: 'TextResponse' }> extends never ? never : 'text')
  | (Extract<FlatSuccessResponses<T>, ContractNoBodyType> extends never ? never : 'noContent')
