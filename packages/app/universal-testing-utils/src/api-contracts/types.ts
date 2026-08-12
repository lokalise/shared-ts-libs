import {
  type ApiContract,
  type ApiContractResponse,
  type BodyDescriptor,
  type ExpandStatusRangeKey,
  type HttpStatusCode,
  type InferSchemaInput,
  isBlobBody,
  isSseBody,
  type RequestPathParamsSchema,
  type ResponseEntry,
  type ResponsesByStatusCode,
  type SseSchemaByEventName,
  type WildcardStatusCodeKey,
} from '@lokalise/api-contracts'
import type { z } from 'zod/v4'

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
