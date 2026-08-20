import {
  type ApiContract,
  type BodyDescriptor,
  ContractNoBody,
  isBlobBody,
  isJsonBody,
  isJsonResponse,
  type SseSchemaByEventName,
} from '@lokalise/api-contracts'
import { z } from 'zod/v4'
import type { ExtendedFastifySchema } from '../types.ts'

// Schemas for non-JSON media types. Raw bodies (`string`/`Buffer`/`Readable`) and SSE streams
// bypass Fastify's serializer, so these are never parsed at runtime — they only describe the
// body in the generated OpenAPI spec (`z.file()` maps to a binary string).
const BLOB_BODY_SCHEMA = z.file()
// A `type: 'null'` response schema is `@fastify/swagger`'s convention for a no-content
// response (rendered without a body in OpenAPI 3.1).
const NO_BODY_SCHEMA = z.null()

/**
 * Describe an SSE stream as the union of its event envelopes, following the OpenAPI 3.x
 * convention for `text/event-stream`: one object schema per event type — `{ event, data,
 * id?, retry? }`, discriminated by the `event` name — so the contract's event payloads are
 * fully visible in the generated spec.
 */
function buildSseEventSchema(schemaByEventName: SseSchemaByEventName): z.ZodType {
  const eventSchemas = Object.entries(schemaByEventName).map(([eventName, dataSchema]) =>
    z.object({
      id: z.string().optional(),
      event: z.literal(eventName),
      data: dataSchema,
      retry: z.int().optional(),
    }),
  )

  const [firstEventSchema, ...restEventSchemas] = eventSchemas
  if (!firstEventSchema) {
    throw new Error('An sseBody() must declare at least one event schema.')
  }

  return restEventSchemas.length === 0 ? firstEventSchema : z.union(eventSchemas)
}

/** A per-status Fastify response schema: a bare Zod schema, or one schema per media type. */
type FastifyResponseSchema =
  | z.ZodType
  | { description?: string; content: Record<string, { schema: z.ZodType }> }

/** Map one content-map body descriptor to the Zod schema describing it. */
function buildBodyDescriptorSchema(descriptor: BodyDescriptor): z.ZodType {
  if (isJsonBody(descriptor)) {
    return descriptor
  }
  return isBlobBody(descriptor)
    ? BLOB_BODY_SCHEMA
    : buildSseEventSchema(descriptor.schemaByEventName)
}

/**
 * Map the contract's `responsesByStatusCode` to Fastify response schemas.
 *
 * A bare Zod schema (JSON) is passed through as-is. A content-map entry becomes Fastify's
 * per-media-type response schema (`{ content: { '<mediaType>': { schema } } }`): JSON
 * descriptors keep their Zod schema — selected by the response `content-type`, both for
 * serialization and in the OpenAPI spec — while `blobBody()` gets a binary placeholder and
 * `sseBody()` a union of its event envelopes. A no-body entry (`noBodyResponse()`) becomes
 * a `z.null()` schema, describing a body-less response.
 */
function buildResponseSchemas(contract: ApiContract): Record<string, FastifyResponseSchema> {
  const schemas: Record<string, FastifyResponseSchema> = {}

  for (const [statusCode, entry] of Object.entries(contract.responsesByStatusCode)) {
    if (isJsonResponse(entry)) {
      schemas[statusCode] = entry
      continue
    }

    if (!entry.content) {
      schemas[statusCode] =
        entry.description === undefined
          ? NO_BODY_SCHEMA
          : NO_BODY_SCHEMA.describe(entry.description)
      continue
    }

    const content: Record<string, { schema: z.ZodType }> = {}
    for (const [mediaType, descriptor] of Object.entries(entry.content)) {
      content[mediaType] = { schema: buildBodyDescriptorSchema(descriptor) }
    }

    schemas[statusCode] = {
      ...(entry.description !== undefined && { description: entry.description }),
      content,
    }
  }

  return schemas
}

/**
 * Build the Fastify route `schema` from an `ApiContract`, driving both
 * runtime validation/serialization and the generated OpenAPI spec.
 */
export function buildFastifyApiSchema(contract: ApiContract): ExtendedFastifySchema {
  const schema: ExtendedFastifySchema = {
    summary: contract.summary,
    hide: contract.visibility !== 'public',
  }

  if (contract.description !== undefined) {
    schema.description = contract.description
  }
  if (contract.tags !== undefined) {
    schema.tags = contract.tags
  }
  if (contract.requestPathParamsSchema) {
    schema.params = contract.requestPathParamsSchema
  }
  if (contract.requestQuerySchema) {
    schema.querystring = contract.requestQuerySchema
  }
  if (contract.requestHeaderSchema) {
    schema.headers = contract.requestHeaderSchema
  }
  if (contract.requestBodySchema !== undefined && contract.requestBodySchema !== ContractNoBody) {
    schema.body = contract.requestBodySchema
  }

  schema.response = buildResponseSchemas(contract)

  return schema
}
