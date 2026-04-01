import type { z } from 'zod/v4'
import type { HttpStatusCode, SuccessfulHttpStatusCode } from '../HttpStatusCodes.ts'
import type { ContractNoBody } from './constants.ts'
import type { ResponsesByStatusCode, SseSchemaByEventName } from './contractResponse.ts'
import type { SseEventOf } from './inferTypes.ts'

/**
 * Maps a single responsesByStatusCode entry value to its TypeScript body type.
 */
type InferResponseBody<T> =
  T extends typeof ContractNoBody
    ? null
    : T extends z.ZodType
      ? z.output<T>
      : T extends { _tag: 'TextResponse' }
        ? string
        : T extends { _tag: 'BlobResponse' }
          ? Blob
          : T extends { _tag: 'SseResponse'; schemaByEventName: infer S extends SseSchemaByEventName }
            ? AsyncIterable<SseEventOf<S>>
            : T extends { _tag: 'AnyOfResponses'; responses: Array<infer Item> }
              ? InferResponseBody<Item>
              : never

/**
 * Like InferResponseBody but returns only SSE bodies — non-SSE entries resolve to never.
 */
type SseInferResponseBody<T> = Extract<InferResponseBody<T>, AsyncIterable<unknown>>

/**
 * Like InferResponseBody but returns only non-SSE bodies — SSE entries resolve to never.
 */
type NonSseInferResponseBody<T> = Exclude<InferResponseBody<T>, AsyncIterable<unknown>>

/**
 * Infers a discriminated union of `{ statusCode, headers, body }` for SSE mode:
 * - success status codes → SSE body only (AsyncIterable)
 * - error status codes  → body as-is (all kinds)
 *
 * THeaders defaults to the Node.js/undici header shape. Override for fetch-based clients.
 */
export type InferSseClientResponse<
  T extends ResponsesByStatusCode,
  THeaders extends Record<string, unknown> = Record<string, string | string[] | undefined>,
> = {
  [K in keyof T & HttpStatusCode]: {
    statusCode: K
    headers: THeaders
    body: K extends SuccessfulHttpStatusCode
      ? SseInferResponseBody<NonNullable<T[K]>>
      : InferResponseBody<NonNullable<T[K]>>
  }
}[keyof T & HttpStatusCode]

/**
 * Infers a discriminated union of `{ statusCode, headers, body }` for non-SSE mode:
 * - success status codes → non-SSE body only (JSON / text / blob / null)
 * - error status codes  → body as-is (all kinds)
 *
 * THeaders defaults to the Node.js/undici header shape. Override for fetch-based clients.
 */
export type InferNonSseClientResponse<
  T extends ResponsesByStatusCode,
  THeaders extends Record<string, unknown> = Record<string, string | string[] | undefined>,
> = {
  [K in keyof T & HttpStatusCode]: {
    statusCode: K
    headers: THeaders
    body: K extends SuccessfulHttpStatusCode
      ? NonSseInferResponseBody<NonNullable<T[K]>>
      : InferResponseBody<NonNullable<T[K]>>
  }
}[keyof T & HttpStatusCode]
