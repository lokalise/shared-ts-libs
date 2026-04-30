import type {
  AnyOfResponses,
  ApiContract,
  HttpStatusCode,
  InferSchemaInput,
  SseSchemaByEventName,
  TypedBlobResponse,
  TypedSseResponse,
  TypedTextResponse,
    RequestPathParamsSchema,
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

// Maps a single responsesByStatusCode entry to the body field(s) needed for mocking.
// symbol (ContractNoBody) → no body field
// ZodType              → { responseBody: z.input<T> }
// TypedSseResponse     → { events: SseMockEventInput[] }
// TypedTextResponse    → { responseText: string }
// TypedBlobResponse    → { responseBlob: string }
// AnyOfResponses       → { responseBody: ...; events: ... } for dual-mode (SSE + JSON)
type InferBodyParam<T> = T extends symbol
  ? { responseBody?: null }
  : T extends z.ZodType
    ? { responseBody: z.input<T> }
    : T extends TypedSseResponse<infer S extends SseSchemaByEventName>
      ? { events: SseMockEventInput<S>[] }
      : T extends TypedTextResponse
        ? { responseText: string }
        : T extends TypedBlobResponse
          ? { responseBlob: string }
          : T extends AnyOfResponses<infer Items>
            ? (Extract<Items, z.ZodType> extends never
                ? object
                : { responseBody: z.input<Extract<Items, z.ZodType>> }) &
                (Extract<Items, TypedSseResponse<any>> extends TypedSseResponse<
                  infer S extends SseSchemaByEventName
                >
                  ? { events: SseMockEventInput<S>[] }
                  : object)
            : object

// Discriminated union: each member pairs one response code with its typed body param.
// responseStatus is required so the runtime always knows which schema entry to use.
type StatusCodeBodyPair<TContract extends ApiContract> = {
  [K in keyof TContract['responsesByStatusCode'] & HttpStatusCode]: {
    responseStatus: K
  } & InferBodyParam<NonNullable<TContract['responsesByStatusCode'][K]>>
}[keyof TContract['responsesByStatusCode'] & HttpStatusCode]

type PathParamsField<TContract extends ApiContract> =
  TContract['requestPathParamsSchema'] extends RequestPathParamsSchema
  ? { pathParams: InferSchemaInput<TContract['requestPathParamsSchema']> }
  : { pathParams?: never }

export type MockResponseParams<TContract extends ApiContract> = PathParamsField<TContract>
    & StatusCodeBodyPair<TContract>
