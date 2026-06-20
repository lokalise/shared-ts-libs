import type { z } from 'zod/v4'
import type {
  HttpStatusCode,
  HttpStatusCodeRange,
  WildcardStatusCodeKey,
} from '../HttpStatusCodes.ts'
import { ContractNoBody } from './constants.ts'

export type ResponseOptions = {
  readonly description?: string
}

export type TypedTextResponse = {
  readonly _tag: 'TextResponse'
  readonly contentType: string
  readonly description?: string
}

/**
 * @deprecated Use {@link blobResponse} instead. `textResponse` and `blobResponse` carry the
 * identical protocol fact (the response `content-type`); they differ only in the JS type the
 * client materializes the body into (`string` vs `Blob`). That decode choice belongs to the
 * consumer, not the shared contract — `blobResponse` defers it to the call site via
 * `.text()` / `.arrayBuffer()` / `.stream()`. Will be removed in a future major release.
 */
export const textResponse = (
  contentType: string,
  options?: ResponseOptions,
): TypedTextResponse => ({
  _tag: 'TextResponse',
  contentType,
  ...(options?.description !== undefined && { description: options.description }),
})

export const isTextResponse = (value: ApiContractResponse): value is TypedTextResponse =>
  typeof value === 'object' && value !== null && '_tag' in value && value._tag === 'TextResponse'

export type TypedBlobResponse = {
  readonly _tag: 'BlobResponse'
  readonly contentType: string
  readonly description?: string
}

export const blobResponse = (
  contentType: string,
  options?: ResponseOptions,
): TypedBlobResponse => ({
  _tag: 'BlobResponse',
  contentType,
  ...(options?.description !== undefined && { description: options.description }),
})

export const isBlobResponse = (value: ApiContractResponse): value is TypedBlobResponse =>
  typeof value === 'object' && value !== null && '_tag' in value && value._tag === 'BlobResponse'

export type SseSchemaByEventName = Record<string, z.ZodType>

export type TypedSseResponse<T extends SseSchemaByEventName = SseSchemaByEventName> = {
  readonly _tag: 'SseResponse'
  readonly schemaByEventName: T
  readonly description?: string
}

export const sseResponse = <T extends SseSchemaByEventName>(
  schemaByEventName: T,
  options?: ResponseOptions,
): TypedSseResponse<T> => ({
  _tag: 'SseResponse',
  schemaByEventName,
  ...(options?.description !== undefined && { description: options.description }),
})

export const isSseResponse = (value: ApiContractResponse): value is TypedSseResponse =>
  typeof value === 'object' && value !== null && '_tag' in value && value._tag === 'SseResponse'

export type TypedJsonResponse = z.ZodType

export const isJsonResponse = (value: ApiContractResponse): value is TypedJsonResponse =>
  typeof value === 'object' && value !== null && !('_tag' in value)

export type TypedApiContractResponse =
  | TypedJsonResponse
  | TypedTextResponse
  | TypedBlobResponse
  | TypedSseResponse

export type AnyOfResponses<T extends TypedApiContractResponse = TypedApiContractResponse> = {
  readonly _tag: 'AnyOfResponses'
  readonly responses: T[]
  readonly description?: string
}

export const anyOfResponses = <T extends TypedApiContractResponse>(
  responses: T[],
  options?: ResponseOptions,
): AnyOfResponses<T> => ({
  _tag: 'AnyOfResponses',
  responses,
  ...(options?.description !== undefined && { description: options.description }),
})

export const isAnyOfResponses = (value: ApiContractResponse): value is AnyOfResponses =>
  typeof value === 'object' && value !== null && '_tag' in value && value._tag === 'AnyOfResponses'

export type NoBodyResponse = {
  readonly _tag: 'NoBodyResponse'
  readonly description?: string
}

export const noBodyResponse = (options?: ResponseOptions): NoBodyResponse => ({
  _tag: 'NoBodyResponse',
  ...(options?.description !== undefined && { description: options.description }),
})

export const isNoBodyResponse = (value: ApiContractResponse): value is NoBodyResponse =>
  typeof value === 'object' && value !== null && '_tag' in value && value._tag === 'NoBodyResponse'

export type ApiContractResponse =
  | typeof ContractNoBody
  | NoBodyResponse
  | TypedApiContractResponse
  | AnyOfResponses

export type ResponsesByStatusCode = Partial<
  Record<HttpStatusCode | WildcardStatusCodeKey, ApiContractResponse>
>

export type ResponseKind =
  | { kind: 'noContent' }
  | { kind: 'text' }
  | { kind: 'blob' }
  | { kind: 'json'; schema: z.ZodType }
  | { kind: 'sse'; schemaByEventName: SseSchemaByEventName }

const matchTypedResponse = (
  entry: TypedApiContractResponse,
  contentType: string,
): ResponseKind | null => {
  if (isTextResponse(entry)) {
    return contentType.includes(entry.contentType) ? { kind: 'text' } : null
  }

  if (isBlobResponse(entry)) {
    return contentType.includes(entry.contentType) ? { kind: 'blob' } : null
  }

  if (isSseResponse(entry)) {
    return contentType.includes('text/event-stream')
      ? { kind: 'sse', schemaByEventName: entry.schemaByEventName }
      : null
  }

  if (contentType.includes('application/json')) {
    return { kind: 'json', schema: entry }
  }

  return null
}

const resolveByKind = (entry: TypedApiContractResponse): ResponseKind => {
  if (isTextResponse(entry)) {
    return { kind: 'text' }
  }
  if (isBlobResponse(entry)) {
    return { kind: 'blob' }
  }
  if (isSseResponse(entry)) {
    return { kind: 'sse', schemaByEventName: entry.schemaByEventName }
  }
  return { kind: 'json', schema: entry }
}

/**
 * Resolves a contract's response entry for a given status code into a concrete `ResponseKind`,
 * taking the response `content-type` into account.
 *
 * Returns `null` when the content-type cannot be matched to any entry in the contract,
 * indicating the response is unexpected and should be treated as an error by the caller.
 *
 * @param schemaEntry - The contract entry for the matched status code (`ContractNoBody`,
 *   a Zod schema, `textResponse`, `blobResponse`, `sseResponse`, or `anyOfResponses`).
 * @param contentType - The `content-type` header value from the actual HTTP response,
 *   or `undefined` when the header is absent.
 * @param strict - When `true` (default), returns `null` if the `content-type` is absent or does
 *   not match the contract entry. When `false`, falls back to the entry's declared kind instead of
 *   returning `null` — only applies to single-entry responses; `anyOfResponses` always requires a
 *   content-type to disambiguate regardless of this flag.
 */
export const resolveContractResponse = (
  schemaEntry: ApiContractResponse,
  contentType: string | undefined,
  strict = true,
): ResponseKind | null => {
  if (schemaEntry === ContractNoBody || isNoBodyResponse(schemaEntry)) {
    return { kind: 'noContent' }
  }

  if (isAnyOfResponses(schemaEntry)) {
    // AnyOfResponses always requires content-type to disambiguate — strict mode has no effect here
    if (!contentType) {
      return null
    }

    for (const item of schemaEntry.responses) {
      const resolved = matchTypedResponse(item, contentType)
      if (resolved) {
        return resolved
      }
    }
    return null
  }

  if (!contentType) {
    return strict ? null : resolveByKind(schemaEntry)
  }

  const matched = matchTypedResponse(schemaEntry, contentType)

  return matched ?? (strict ? null : resolveByKind(schemaEntry))
}

function getRangeKey(statusCode: number): HttpStatusCodeRange | null {
  if (statusCode >= 100 && statusCode < 200) return '1xx'
  if (statusCode >= 200 && statusCode < 300) return '2xx'
  if (statusCode >= 300 && statusCode < 400) return '3xx'
  if (statusCode >= 400 && statusCode < 500) return '4xx'
  if (statusCode >= 500 && statusCode < 600) return '5xx'
  return null
}

/**
 * Combines status-code lookup and content-type resolution into a single call.
 * Lookup precedence: exact code → range key (e.g. `'4xx'`) → `'default'`.
 * Returns `null` when no entry matches or the content-type cannot be matched.
 */
export function resolveResponseEntry(
  responsesByStatusCode: ResponsesByStatusCode,
  statusCode: number,
  contentType: string | undefined,
  strictContentType: boolean,
): ResponseKind | null {
  const exactEntry = responsesByStatusCode[statusCode as HttpStatusCode]
  if (exactEntry) {
    return resolveContractResponse(exactEntry, contentType, strictContentType)
  }

  const rangeKey = getRangeKey(statusCode)
  if (rangeKey) {
    const rangeEntry = responsesByStatusCode[rangeKey]
    if (rangeEntry) {
      return resolveContractResponse(rangeEntry, contentType, strictContentType)
    }
  }

  const defaultEntry = responsesByStatusCode.default
  if (defaultEntry) {
    return resolveContractResponse(defaultEntry, contentType, strictContentType)
  }

  return null
}
