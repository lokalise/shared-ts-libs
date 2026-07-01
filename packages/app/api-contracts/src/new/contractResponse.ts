import type { z } from 'zod/v4'
import type {
  HttpStatusCode,
  HttpStatusCodeRange,
  WildcardStatusCodeKey,
} from '../HttpStatusCodes.ts'
export type ResponseOptions = {
  readonly description?: string
}

export type SseSchemaByEventName = Record<string, z.ZodType>

export type TypedJsonResponse = z.ZodType

export const isJsonResponse = (
  value: ApiContractResponse | ResponseEntry,
): value is TypedJsonResponse =>
  typeof value === 'object' && value !== null && !('content' in value) && !('allowNoBody' in value)

export type TypedApiContractResponse = TypedJsonResponse

export type ApiContractResponse = TypedApiContractResponse

// ───────────────────────────────────────────────────────────────────────────
// Content-map response entries (the newer, OpenAPI-shaped way to declare a
// response). A status code maps to a `{ content }` object keyed by media type,
// which lets a single status code expose several media types — including more
// than one JSON variant (e.g. `application/json` and `application/json+01`) —
// each disambiguated by an exact content-type match.
//
// The other per-status values (a bare Zod schema for JSON, `noBodyResponse`) remain
// fully supported; blob and SSE bodies are declared via content-map descriptors
// (`blobBody()` / `sseBody()`). A contract may freely mix the two styles across status codes.
// ───────────────────────────────────────────────────────────────────────────

/** Opaque binary body; the media type is supplied by the content-map key. */
export type BlobBody = {
  readonly _tag: 'BlobBody'
}

export const blobBody = (): BlobBody => ({ _tag: 'BlobBody' })

export const isBlobBody = (value: BodyDescriptor): value is BlobBody =>
  typeof value === 'object' && value !== null && '_tag' in value && value._tag === 'BlobBody'

/** Server-Sent Events body; the media type is supplied by the content-map key. */
export type SseBody<T extends SseSchemaByEventName = SseSchemaByEventName> = {
  readonly _tag: 'SseBody'
  readonly schemaByEventName: T
}

export const sseBody = <T extends SseSchemaByEventName>(schemaByEventName: T): SseBody<T> => ({
  _tag: 'SseBody',
  schemaByEventName,
})

export const isSseBody = (value: BodyDescriptor): value is SseBody =>
  typeof value === 'object' && value !== null && '_tag' in value && value._tag === 'SseBody'

export const isJsonBody = (value: BodyDescriptor): value is z.ZodType =>
  typeof value === 'object' && value !== null && !('_tag' in value)

/**
 * A value in a {@link ResponseContentMap}; the media type is the map key, so a
 * descriptor never carries a content type itself. A bare Zod schema is JSON.
 */
export type BodyDescriptor = z.ZodType | BlobBody | SseBody

/** Maps a response media type (e.g. `application/json`) to the body it carries. */
export type ResponseContentMap = Record<string, BodyDescriptor>

/** A content-map response carrying a body for one or more media types. */
export type BodyContentResponseEntry = {
  readonly description?: string
  readonly content: ResponseContentMap
  readonly allowNoBody?: boolean
}

/** A content-map response that never carries a body. */
export type NoBodyContentResponseEntry = {
  readonly description?: string
  readonly content?: never
  readonly allowNoBody: true
}

/**
 * A content-map response entry. Either a body response (`content` required,
 * optionally `allowNoBody`) or a no-body response (`allowNoBody: true`, no
 * `content`). The union forces at least one of `content` / `allowNoBody`.
 */
export type ResponseEntry = BodyContentResponseEntry | NoBodyContentResponseEntry

export const isContentResponseEntry = (
  value: ApiContractResponse | ResponseEntry,
): value is ResponseEntry =>
  typeof value === 'object' && value !== null && ('content' in value || 'allowNoBody' in value)

/**
 * Declares a no-body response (e.g. `204`).
 */
export const noBodyResponse = (options?: ResponseOptions): NoBodyContentResponseEntry => ({
  allowNoBody: true,
  ...(options?.description !== undefined && { description: options.description }),
})

/**
 * Declares a binary/opaque response for a single media type.
 */
export const blobResponse = (
  contentType: string,
  options?: ResponseOptions,
): BodyContentResponseEntry => ({
  content: { [contentType]: blobBody() },
  ...(options?.description !== undefined && { description: options.description }),
})

/**
 * Declares a Server-Sent Events response.
 */
export const sseResponse = <T extends SseSchemaByEventName>(
  schemaByEventName: T,
  options?: ResponseOptions,
): BodyContentResponseEntry => ({
  content: { 'text/event-stream': sseBody(schemaByEventName) },
  ...(options?.description !== undefined && { description: options.description }),
})

export type ResponsesByStatusCode = Partial<
  Record<HttpStatusCode | WildcardStatusCodeKey, ApiContractResponse | ResponseEntry>
>

export type ResponseKind =
  | { kind: 'noContent' }
  | { kind: 'blob' }
  | { kind: 'json'; schema: z.ZodType }
  | { kind: 'sse'; schemaByEventName: SseSchemaByEventName }

const matchTypedResponse = (
  entry: TypedApiContractResponse,
  contentType: string,
): ResponseKind | null =>
  contentType.includes('application/json') ? { kind: 'json', schema: entry } : null

const resolveByKind = (entry: TypedApiContractResponse): ResponseKind => ({
  kind: 'json',
  schema: entry,
})

const normalizeMediaType = (contentType: string): string =>
  (contentType.split(';')[0] ?? contentType).trim().toLowerCase()

const descriptorToKind = (descriptor: BodyDescriptor): ResponseKind => {
  if (isBlobBody(descriptor)) {
    return { kind: 'blob' }
  }
  if (isSseBody(descriptor)) {
    return { kind: 'sse', schemaByEventName: descriptor.schemaByEventName }
  }
  return { kind: 'json', schema: descriptor }
}

/**
 * Resolves a content-map {@link ResponseEntry}. Body media types are matched by exact
 * (parameter-stripped, case-insensitive) content-type equality, so e.g. `application/json`
 * and `application/json+01` are kept distinct.
 */
const resolveContentEntry = (
  entry: ResponseEntry,
  contentType: string | undefined,
  strict: boolean,
): ResponseKind | null => {
  if (!entry.content) {
    return { kind: 'noContent' }
  }

  const entries = Object.entries(entry.content)

  if (!contentType) {
    if (entry.allowNoBody) {
      return { kind: 'noContent' }
    }
  } else {
    const target = normalizeMediaType(contentType)
    for (const [mediaType, descriptor] of entries) {
      if (normalizeMediaType(mediaType) === target) {
        return descriptorToKind(descriptor)
      }
    }
  }

  // No content-type (without allowNoBody), or no media type matched: in non-strict mode fall
  // back to the sole descriptor when the entry declares exactly one.
  const onlyDescriptor = entries.length === 1 ? entries[0]?.[1] : undefined
  return !strict && onlyDescriptor ? descriptorToKind(onlyDescriptor) : null
}

/**
 * Resolves a contract's response entry for a given status code into a concrete `ResponseKind`,
 * taking the response `content-type` into account.
 *
 * Returns `null` when the content-type cannot be matched to any entry in the contract,
 * indicating the response is unexpected and should be treated as an error by the caller.
 *
 * @param schemaEntry - The contract entry for the matched status code (a Zod schema,
 *   `noBodyResponse`, or a content-map entry).
 * @param contentType - The `content-type` header value from the actual HTTP response,
 *   or `undefined` when the header is absent.
 * @param strict - When `true` (default), returns `null` if the `content-type` is absent or does
 *   not match the contract entry. When `false`, falls back to the entry's declared kind instead of
 *   returning `null` — only applies to single-entry responses.
 */
export const resolveContractResponse = (
  schemaEntry: ApiContractResponse | ResponseEntry,
  contentType: string | undefined,
  strict = true,
): ResponseKind | null => {
  if (isContentResponseEntry(schemaEntry)) {
    return resolveContentEntry(schemaEntry, contentType, strict)
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
