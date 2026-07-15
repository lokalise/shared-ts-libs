import type {
  ApiContract,
  ExpandStatusRangeKey,
  HttpStatusCode,
  InferSchemaInput,
  RequestPathParamsSchema,
  SseSchemaByEventName,
  WildcardStatusCodeKey,
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

// Maps a single responsesByStatusCode entry to the body field(s) needed for mocking.
// ZodType              → { responseJson: z.input<T> }
// content-map entry    → body field(s) for its declared descriptors (see InferContentBodyParam)
//                        (a no-body entry `{ allowNoBody: true }` falls through to no body field)
type InferBodyParam<T> = T extends z.ZodType
  ? { responseJson: z.input<T> }
  : T extends { content: infer C }
    ? InferContentBodyParam<C>
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
