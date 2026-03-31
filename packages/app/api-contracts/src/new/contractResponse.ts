import type { z } from 'zod/v4'
import type { HttpStatusCode } from '../HttpStatusCodes.ts'
import { ContractNoBody } from './constants.ts'

export type TypedTextResponse = {
  readonly _tag: 'TextResponse'
  readonly contentType: string
}

export const textResponse = (contentType: string): TypedTextResponse => ({
  _tag: 'TextResponse',
  contentType,
})

export const isTextResponse = (value: ApiContractResponse): value is TypedTextResponse =>
  typeof value === 'object' && value !== null && '_tag' in value && value._tag === 'TextResponse'

export type TypedBlobResponse = {
  readonly _tag: 'BlobResponse'
  readonly contentType: string
}

export const blobResponse = (contentType: string): TypedBlobResponse => ({
  _tag: 'BlobResponse',
  contentType,
})

export const isBlobResponse = (value: ApiContractResponse): value is TypedBlobResponse =>
  typeof value === 'object' && value !== null && '_tag' in value && value._tag === 'BlobResponse'

export type SseSchemaByEventName = Record<string, z.ZodType>

export type TypedSseResponse<T extends SseSchemaByEventName = SseSchemaByEventName> = {
  readonly _tag: 'SseResponse'
  readonly schemaByEventName: T
}

export const sseResponse = <T extends SseSchemaByEventName>(
  schemaByEventName: T,
): TypedSseResponse<T> => ({
  _tag: 'SseResponse',
  schemaByEventName,
})

export const isSseResponse = (value: ApiContractResponse): value is TypedSseResponse =>
  typeof value === 'object' && value !== null && '_tag' in value && value._tag === 'SseResponse'

export type TypedJsonResponse = z.ZodType

export type TypedApiContractResponse =
  | TypedJsonResponse
  | TypedTextResponse
  | TypedBlobResponse
  | TypedSseResponse

export type AnyOfResponses<T extends TypedApiContractResponse = TypedApiContractResponse> = {
  readonly _tag: 'AnyOfResponses'
  readonly responses: T[]
}

export const anyOfResponses = <T extends TypedApiContractResponse>(
  responses: T[],
): AnyOfResponses<T> => ({
  _tag: 'AnyOfResponses',
  responses,
})

export const isAnyOfResponses = (value: ApiContractResponse): value is AnyOfResponses =>
  typeof value === 'object' && value !== null && '_tag' in value && value._tag === 'AnyOfResponses'

export type ApiContractResponse = typeof ContractNoBody | TypedApiContractResponse | AnyOfResponses

export type ResponseSchemasByStatusCode = Partial<Record<HttpStatusCode, ApiContractResponse>>

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

export const resolveContractResponse = (
  schemaEntry: ApiContractResponse,
  contentType: string | undefined,
): ResponseKind | null => {
  if (schemaEntry === ContractNoBody) {
    return { kind: 'noContent' }
  }

  if (!contentType) {
    return null
  }

  if (isAnyOfResponses(schemaEntry)) {
    for (const item of schemaEntry.responses) {
      const resolved = matchTypedResponse(item, contentType)

      if (resolved) {
        return resolved
      }
    }
    return null
  }

  return matchTypedResponse(schemaEntry, contentType)
}
