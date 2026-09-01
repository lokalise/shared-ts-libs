import {
  type ApiContract,
  type ApiContractResponse,
  type BodyDescriptor,
  describeApiContract,
  type ExpandStatusRangeKey,
  type HttpStatusCode,
  type InferSchemaInput,
  isBlobBody,
  isContentResponseEntry,
  isJsonBody,
  isSseBody,
  type RequestPathParamsSchema,
  type ResponseEntry,
  type ResponsesByStatusCode,
  type SseSchemaByEventName,
  type WildcardStatusCodeKey,
} from '@lokalise/api-contracts'
import type { z } from 'zod/v4'
import { type MockResponseWrapper, unwrapMockResponse } from '../responseWrapper.ts'

export const JSON_MEDIA_TYPE = 'application/json'

export type SseMockEventInput<S extends SseSchemaByEventName> = {
  [K in keyof S & string]: { event: K; data: z.input<NonNullable<S[K]>> }
}[keyof S & string]

export function formatSseResponse(events: { event: string; data: unknown }[]): string {
  return events
    .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n`)
    .join('\n')
}

function getRangeKey(statusCode: HttpStatusCode) {
  if (statusCode >= 100 && statusCode < 200) return '1xx'
  if (statusCode >= 200 && statusCode < 300) return '2xx'
  if (statusCode >= 300 && statusCode < 400) return '3xx'
  if (statusCode >= 400 && statusCode < 500) return '4xx'
  if (statusCode >= 500 && statusCode < 600) return '5xx'
}

// Resolves the response body for an explicitly selected content-type entry.
// JSON descriptors validate/strip the body through their schema, like the negotiated path does.
export function resolveExplicitContentBody(
  content: Record<string, BodyDescriptor>,
  contentType: string,
  // biome-ignore lint/suspicious/noExplicitAny: field access is safe — type is enforced by MockResponseParams
  params: any,
): string {
  const descriptor = content[contentType]

  if (descriptor === undefined) {
    throw new Error('Specified contentType cannot be mapped with contract')
  }
  if (isSseBody(descriptor)) return formatSseResponse(params.events)
  if (isBlobBody(descriptor)) return params.responseBlob

  return JSON.stringify(descriptor.parse(params.responseJson))
}

export function resolveContractEntry(
  responsesByStatusCode: ResponsesByStatusCode,
  statusCode: HttpStatusCode,
): ApiContractResponse | ResponseEntry | undefined {
  const rangeKey = getRangeKey(statusCode)

  return (
    responsesByStatusCode[statusCode] ??
    (rangeKey ? responsesByStatusCode[rangeKey] : undefined) ??
    responsesByStatusCode.default
  )
}

/** The JSON body a mock serves for one status: which media type it goes out as, and its schema. */
export type JsonResponseTarget = {
  /** Content-type header the response carries. The content-map key, or `application/json`. */
  mediaType: string
  /** Schema the body is validated against. */
  schema: z.ZodType
  /** Media type of an SSE descriptor sharing the same status entry, when the contract declares one. */
  sseMediaType?: string
}

/**
 * Media type and schema a resolved status entry serves JSON under, for both bare-schema entries
 * and content maps. `contentType` pins one content-map key; without it the entry must declare
 * exactly one JSON descriptor.
 *
 * Throws when the entry has no JSON representation, when `contentType` names something the entry
 * does not declare as JSON, or when the choice of media type would be ambiguous.
 */
export function resolveJsonTarget(
  responseEntry: ApiContractResponse | ResponseEntry,
  contentType: string | undefined,
  statusCode: HttpStatusCode,
): JsonResponseTarget {
  if (!isContentResponseEntry(responseEntry)) {
    if (contentType !== undefined && contentType !== JSON_MEDIA_TYPE) {
      throw new Error('Specified contentType cannot be mapped with contract')
    }
    return { mediaType: JSON_MEDIA_TYPE, schema: responseEntry }
  }

  if (!responseEntry.content) {
    throw new Error(
      `Status ${statusCode} declares no response body; mockResponseWithImplementation needs a JSON body to return`,
    )
  }

  const contentEntries = Object.entries(responseEntry.content)
  const sseMediaType = contentEntries.find(([, descriptor]) => isSseBody(descriptor))?.[0]
  const jsonEntries = contentEntries.filter((entry): entry is [string, z.ZodType] =>
    isJsonBody(entry[1]),
  )

  if (contentType !== undefined) {
    const selected = jsonEntries.find(([mediaType]) => mediaType === contentType)
    if (!selected) {
      throw new Error(
        contentType in responseEntry.content
          ? `Specified contentType ${contentType} is not a JSON body; use mockResponse for SSE and blob responses`
          : 'Specified contentType cannot be mapped with contract',
      )
    }
    return { mediaType: selected[0], schema: selected[1], sseMediaType }
  }

  const [onlyJsonEntry, secondJsonEntry] = jsonEntries

  if (!onlyJsonEntry) {
    throw new Error(
      `Status ${statusCode} has no JSON response body; use mockResponse for SSE and blob responses`,
    )
  }
  if (secondJsonEntry) {
    const declared = jsonEntries.map(([mediaType]) => mediaType).join(', ')
    throw new Error(
      `Status ${statusCode} declares more than one JSON content type (${declared}); pass contentType to select one`,
    )
  }

  return { mediaType: onlyJsonEntry[0], schema: onlyJsonEntry[1], sseMediaType }
}

/** {@link resolveJsonTarget} preceded by the exact → range → `'default'` status lookup. */
export function resolveJsonTargetForStatus(
  responsesByStatusCode: ResponsesByStatusCode,
  statusCode: HttpStatusCode,
  contentType: string | undefined,
  unmappedStatusMessage = 'Specified responseStatus cannot be mapped with contract',
): JsonResponseTarget {
  const responseEntry = resolveContractEntry(responsesByStatusCode, statusCode)

  if (!responseEntry) {
    throw new Error(unmappedStatusMessage)
  }

  return resolveJsonTarget(responseEntry, contentType, statusCode)
}

/** A reply the framework-specific helpers translate into their own response object. */
export type MockImplementationReply = {
  statusCode: number
  mediaType: string
  body: string
}

function reportMockFailure(
  helperName: string,
  contract: ApiContract,
  statusCode: number,
  reason: string,
  cause?: unknown,
): MockImplementationReply {
  const message = `[${helperName}.mockResponseWithImplementation] ${describeApiContract(contract)}: ${reason}`

  // mockttp and msw turn a throwing route callback into an opaque 500, which reaches the test as a
  // client-side parse failure with the real cause nowhere in sight. Log it where the test can see.
  // biome-ignore lint/suspicious/noConsole: surfacing the cause in test output is the point
  console.error(message, cause ?? '')

  return { statusCode, mediaType: JSON_MEDIA_TYPE, body: JSON.stringify({ message }) }
}

/**
 * Runs a `handleRequest` handler and turns its result into a reply: the body validated against the
 * schema for the status actually sent, under the media type the contract declares it for.
 *
 * Handler and validation failures become a labelled 500 rather than a bare framework 500.
 */
export async function runMockImplementation(args: {
  helperName: string
  contract: ApiContract
  responseStatus: HttpStatusCode
  target: JsonResponseTarget
  accept: string
  handleRequest: () => unknown
}): Promise<MockImplementationReply> {
  const { helperName, contract, responseStatus, target, accept, handleRequest } = args

  // A handler only produces JSON. Serving it to a caller that asked for the entry's SSE branch
  // would hand back a body that caller cannot read, so refuse instead of answering wrongly.
  if (target.sseMediaType && accept.includes(target.sseMediaType)) {
    return reportMockFailure(
      helperName,
      contract,
      406,
      `request negotiated ${target.sseMediaType}, which mockResponseWithImplementation cannot serve; use mockResponse for the SSE branch`,
    )
  }

  try {
    const { body, status } = unwrapMockResponse(await handleRequest())
    const statusCode = status ?? responseStatus
    // A per-call status override selects a different contract entry, so the body is validated
    // against the schema declared for the status actually being sent.
    const resolved =
      statusCode === responseStatus
        ? target
        : resolveJsonTargetForStatus(
            contract.responsesByStatusCode,
            statusCode as HttpStatusCode,
            undefined,
            `Status ${statusCode} passed to response() cannot be mapped with contract`,
          )

    return {
      statusCode,
      mediaType: resolved.mediaType,
      body: JSON.stringify(resolved.schema.parse(body)),
    }
  } catch (error) {
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    return reportMockFailure(helperName, contract, 500, reason, error)
  }
}

// Maps a content-map entry's descriptors to the body field(s) needed for mocking:
// a JSON descriptor → { responseJson }, an SseBody → { events }, a BlobBody → { responseBlob }.
// A no-body content entry ({ allowNoBody: true }, no `content`) has no descriptors and is handled
// by the `object` fallback in InferBodyParam (no body field).
type InferContentBodyParam<C> = ([Extract<C[keyof C], z.ZodType>] extends [never]
  ? object
  : { responseJson: z.input<Extract<C[keyof C], z.ZodType>> }) &
  ([Extract<C[keyof C], { _tag: 'SseBody' }>] extends [never]
    ? object
    : Extract<C[keyof C], { _tag: 'SseBody' }> extends {
          schemaByEventName: infer S extends SseSchemaByEventName
        }
      ? { events: SseMockEventInput<S>[] }
      : object) &
  ([Extract<C[keyof C], { _tag: 'BlobBody' }>] extends [never] ? object : { responseBlob: string })

// Maps one content descriptor to the single body field it needs for mocking.
type InferDescriptorBodyParam<D> = D extends z.ZodType
  ? { responseJson: z.input<D> }
  : D extends { _tag: 'SseBody'; schemaByEventName: infer S extends SseSchemaByEventName }
    ? { events: SseMockEventInput<S>[] }
    : D extends { _tag: 'BlobBody' }
      ? { responseBlob: string }
      : object

// Selecting one content-type entry explicitly — only that descriptor's body field is required.
type PerContentTypeBodyParam<C> = {
  [K in keyof C & string]: { contentType: K } & InferDescriptorBodyParam<C[K]>
}[keyof C & string]

// Maps a single responsesByStatusCode entry to the body field(s) needed for mocking.
// ZodType              → { responseJson: z.input<T> }
// content-map entry    → without `contentType`: body field(s) for all declared descriptors
//                        (see InferContentBodyParam); with `contentType`: only the selected
//                        descriptor's body field (see PerContentTypeBodyParam)
//                        (a no-body entry `{ allowNoBody: true }` falls through to no body field)
type InferBodyParam<T> = T extends z.ZodType
  ? { responseJson: z.input<T> }
  : T extends { content: infer C }
    ? ({ contentType?: never } & InferContentBodyParam<C>) | PerContentTypeBodyParam<C>
    : object

type ExactStatusCodePairs<TContract extends ApiContract> = {
  [K in keyof TContract['responsesByStatusCode'] & HttpStatusCode]: {
    responseStatus: K
  } & InferBodyParam<NonNullable<TContract['responsesByStatusCode'][K]>>
}[keyof TContract['responsesByStatusCode'] & HttpStatusCode]

type RangeStatusCodePairs<TContract extends ApiContract> = {
  [K in keyof TContract['responsesByStatusCode'] & WildcardStatusCodeKey]: {
    responseStatus: Exclude<
      ExpandStatusRangeKey<K>,
      keyof TContract['responsesByStatusCode'] & HttpStatusCode
    >
  } & InferBodyParam<NonNullable<TContract['responsesByStatusCode'][K]>>
}[keyof TContract['responsesByStatusCode'] & WildcardStatusCodeKey]

type StatusCodeBodyPair<TContract extends ApiContract> =
  | ExactStatusCodePairs<TContract>
  | RangeStatusCodePairs<TContract>

type PathParamsField<TContract extends ApiContract> =
  TContract['requestPathParamsSchema'] extends RequestPathParamsSchema
    ? { pathParams: InferSchemaInput<TContract['requestPathParamsSchema']> }
    : { pathParams?: never }

export type MockResponseParams<TContract extends ApiContract> = PathParamsField<TContract> &
  StatusCodeBodyPair<TContract>

/**
 * JSON body type a status entry accepts, whether it is a bare schema or a content map.
 * Resolves to `never` for entries with no JSON representation (SSE-only, blob-only, no-body).
 */
type InferJsonBody<T> = T extends z.ZodType
  ? z.input<T>
  : T extends { content: infer C }
    ? [Extract<C[keyof C], z.ZodType>] extends [never]
      ? never
      : z.input<Extract<C[keyof C], z.ZodType>>
    : never

/**
 * Every JSON body the contract declares, across all of its status entries. A body wrapped with
 * `response({ status })` is validated against the entry for that status, so it is not confined to
 * the one `responseStatus` selected.
 */
type AnyDeclaredJsonBody<TContract extends ApiContract> = {
  [K in keyof TContract['responsesByStatusCode']]: InferJsonBody<
    NonNullable<TContract['responsesByStatusCode'][K]>
  >
}[keyof TContract['responsesByStatusCode']]

type HandleRequestField<TRequestInfo, TBody, TAnyBody> = [TBody] extends [never]
  ? never
  : {
      handleRequest: (
        requestInfo: TRequestInfo,
      ) => TBody | MockResponseWrapper<TAnyBody> | Promise<TBody | MockResponseWrapper<TAnyBody>>
    }

/** True for a union of two or more members, false for a single type. */
type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never

// Selecting one JSON content-type entry explicitly: that descriptor types the handler's result.
type PerContentTypeHandleRequest<C, TRequestInfo, TAnyBody> = {
  [K in keyof C & string]: C[K] extends z.ZodType
    ? { contentType: K } & HandleRequestField<TRequestInfo, z.input<C[K]>, TAnyBody>
    : never
}[keyof C & string]

// Maps a single responsesByStatusCode entry to the handler field it accepts.
// ZodType                   → handler returns that schema's input, no `contentType`
// content map, one JSON     → same, and `contentType` may still name that one media type
// content map, several JSON → `contentType` is required, since which one gets served would
//                             otherwise be ambiguous (unlike mockResponse, which has a fixed body
//                             to fall back on, a handler's result must match the chosen schema)
// no JSON descriptor at all → never, which drops the status from the union entirely
type InferHandleRequestParam<T, TRequestInfo, TAnyBody> = T extends z.ZodType
  ? { contentType?: never } & HandleRequestField<TRequestInfo, z.input<T>, TAnyBody>
  : T extends { content: infer C }
    ? [IsUnion<Extract<C[keyof C], z.ZodType>>] extends [true]
      ? PerContentTypeHandleRequest<C, TRequestInfo, TAnyBody>
      :
          | ({ contentType?: never } & HandleRequestField<TRequestInfo, InferJsonBody<T>, TAnyBody>)
          | PerContentTypeHandleRequest<C, TRequestInfo, TAnyBody>
    : never

type ExactStatusCodeImplementationPairs<TContract extends ApiContract, TRequestInfo> = {
  [K in keyof TContract['responsesByStatusCode'] & HttpStatusCode]: {
    responseStatus: K
  } & InferHandleRequestParam<
    NonNullable<TContract['responsesByStatusCode'][K]>,
    TRequestInfo,
    AnyDeclaredJsonBody<TContract>
  >
}[keyof TContract['responsesByStatusCode'] & HttpStatusCode]

type RangeStatusCodeImplementationPairs<TContract extends ApiContract, TRequestInfo> = {
  [K in keyof TContract['responsesByStatusCode'] & WildcardStatusCodeKey]: {
    responseStatus: Exclude<
      ExpandStatusRangeKey<K>,
      keyof TContract['responsesByStatusCode'] & HttpStatusCode
    >
  } & InferHandleRequestParam<
    NonNullable<TContract['responsesByStatusCode'][K]>,
    TRequestInfo,
    AnyDeclaredJsonBody<TContract>
  >
}[keyof TContract['responsesByStatusCode'] & WildcardStatusCodeKey]

/**
 * Params for a mock whose JSON body is computed per request.
 *
 * `responseStatus` selects the contract entry, which types `handleRequest`'s return value, and
 * `contentType` picks between JSON media types when the entry declares more than one. The handler
 * may wrap its result with the helper's static `response()` to override the status on a single
 * call, in which case the body is validated against the entry for that status. Only JSON entries
 * are addressable: SSE and blob responses stay static, via `mockResponse`.
 */
export type MockImplementationParams<
  TContract extends ApiContract,
  TRequestInfo,
> = PathParamsField<TContract> &
  (
    | ExactStatusCodeImplementationPairs<TContract, TRequestInfo>
    | RangeStatusCodeImplementationPairs<TContract, TRequestInfo>
  )
