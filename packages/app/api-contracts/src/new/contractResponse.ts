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

/**
 * Lazy, single-consume accessor over a `blobResponse()` body — the client-side value a blob
 * response resolves to. Mirrors the accessor surface of Fetch's `Response`/`Blob`.
 *
 * The underlying body is a one-shot stream: the first accessor you call consumes it; calling a
 * second throws. Pick one. Draining the body (any accessor except a lazy `stream()`, or `cancel()`)
 * is also what releases the connection — a handle you never touch keeps it open.
 */
export interface BlobResponseHandle {
  /** Raw stream, for piping/backpressure. You own draining or cancelling it. */
  stream(): ReadableStream<Uint8Array>
  /** Buffer the whole body into a `Blob`. The common case; echoes `blobResponse()`. */
  blob(): Promise<Blob>
  /** Buffer the whole body and decode it as UTF-8 text. */
  text(): Promise<string>
  /** Buffer the whole body into an `ArrayBuffer`. */
  arrayBuffer(): Promise<ArrayBuffer>
  /** Discard the body without materializing it, releasing the connection. */
  cancel(): Promise<void>
}

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

/** Commonly used response media types, offered as autocomplete suggestions. */
export type CommonResponseContentType =
  | 'application/json'
  | 'application/octet-stream'
  | 'application/pdf'
  | 'application/x-ndjson'
  | 'application/xml'
  | 'application/zip'
  | 'audio/mpeg'
  | 'audio/ogg'
  | 'image/gif'
  | 'image/jpeg'
  | 'image/png'
  | 'image/svg+xml'
  | 'image/webp'
  | 'text/csv'
  | 'text/event-stream'
  | 'text/html'
  | 'text/plain'
  | 'video/mp4'
  | 'video/webm'

/**
 * A response media type. Common values are autocompleted; any other string
 * (e.g. a vendored variant like `application/json+01`) is accepted too.
 */
export type ResponseContentType = CommonResponseContentType | (string & {})

/**
 * Maps a response media type (e.g. `application/json`) to the body it carries.
 * {@link CommonResponseContentType} keys are autocompleted; any other media type is accepted too.
 */
export type ResponseContentMap = Partial<Record<CommonResponseContentType, BodyDescriptor>> &
  Record<string, BodyDescriptor>

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
export const blobResponse = <TContentType extends ResponseContentType>(
  contentType: TContentType,
  options?: ResponseOptions,
) =>
  ({
    // A computed property with a generic key widens to `{ [x: string]: ... }`, losing the literal
    // media type — assert the single-key record shape to keep `TContentType` in the entry type.
    content: { [contentType]: blobBody() } as { readonly [K in TContentType]: BlobBody },
    ...(options?.description !== undefined && { description: options.description }),
  }) as const satisfies BodyContentResponseEntry

/**
 * Declares a Server-Sent Events response.
 */
export const sseResponse = <T extends SseSchemaByEventName>(
  schemaByEventName: T,
  options?: ResponseOptions,
) =>
  ({
    content: { 'text/event-stream': sseBody(schemaByEventName) },
    ...(options?.description !== undefined && { description: options.description }),
  }) as const satisfies BodyContentResponseEntry

export type ResponsesByStatusCode = Partial<
  Record<HttpStatusCode | WildcardStatusCodeKey, ApiContractResponse | ResponseEntry>
>

export type ResponseKind =
  | { kind: 'noContent' }
  | { kind: 'blob' }
  | { kind: 'json'; schema: z.ZodType }
  | { kind: 'sse'; schemaByEventName: SseSchemaByEventName }

const normalizeMediaType = (contentType: string): string =>
  (contentType.split(';')[0] ?? contentType).trim().toLowerCase()

const matchTypedResponse = (
  entry: TypedApiContractResponse,
  contentType: string,
): ResponseKind | null =>
  normalizeMediaType(contentType) === 'application/json' ? { kind: 'json', schema: entry } : null

const resolveByKind = (entry: TypedApiContractResponse): ResponseKind => ({
  kind: 'json',
  schema: entry,
})

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
