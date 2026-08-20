import {
  blobBody,
  ContractNoBody,
  defineApiContract,
  noBodyResponse,
  sseBody,
} from '@lokalise/api-contracts'
import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { buildFastifyApiSchema } from './buildFastifyApiSchema.ts'

const userSchema = z.object({ id: z.string(), name: z.string() })

const sseEventsSchema = {
  update: z.object({ value: z.number() }),
  done: z.object({ total: z.number() }),
}

type ResponseSchemas = Record<
  number,
  { description?: string; content: Record<string, { schema: z.ZodType }> }
>

// ============================================================================
// OpenAPI metadata
// ============================================================================

describe('buildFastifyApiSchema — OpenAPI metadata', () => {
  it('maps summary, description and tags', () => {
    const contract = defineApiContract({
      visibility: 'public',
      method: 'get',
      summary: 'List users',
      description: 'Returns all users',
      tags: ['users'],
      pathResolver: () => '/users',
      responsesByStatusCode: { 200: userSchema },
    })

    const schema = buildFastifyApiSchema(contract)
    expect(schema.summary).toBe('List users')
    expect(schema.description).toBe('Returns all users')
    expect(schema.tags).toEqual(['users'])
  })

  it('omits description and tags the contract does not declare', () => {
    const contract = defineApiContract({
      visibility: 'public',
      method: 'get',
      summary: 'List users',
      pathResolver: () => '/users',
      responsesByStatusCode: { 200: userSchema },
    })

    const schema = buildFastifyApiSchema(contract)
    expect(schema.summary).toBe('List users')
    expect(schema).not.toHaveProperty('description')
    expect(schema).not.toHaveProperty('tags')
  })

  it('maps internal visibility to hide true', () => {
    const contract = defineApiContract({
      method: 'get',
      summary: 'List users',
      pathResolver: () => '/users',
      responsesByStatusCode: { 200: userSchema },
      visibility: 'internal',
    })

    const schema = buildFastifyApiSchema(contract)
    expect(schema.hide).toBe(true)
  })

  it('stamps hide false for public contracts', () => {
    const contract = defineApiContract({
      visibility: 'public',
      method: 'get',
      summary: 'List users',
      pathResolver: () => '/users',
      responsesByStatusCode: { 200: userSchema },
    })

    const schema = buildFastifyApiSchema(contract)
    expect(schema.hide).toBe(false)
  })
})

// ============================================================================
// Request schemas
// ============================================================================

describe('buildFastifyApiSchema — request schemas', () => {
  it('maps path params, query and header schemas', () => {
    const contract = defineApiContract({
      visibility: 'public',
      method: 'get',
      summary: 'Get a user',
      pathResolver: (p: { userId: string }) => `/users/${p.userId}`,
      requestPathParamsSchema: z.object({ userId: z.string() }),
      requestQuerySchema: z.object({ limit: z.string() }),
      requestHeaderSchema: z.object({ authorization: z.string() }),
      responsesByStatusCode: { 200: userSchema },
    })

    const schema = buildFastifyApiSchema(contract)
    expect(schema.params).toBe(contract.requestPathParamsSchema)
    expect(schema.querystring).toBe(contract.requestQuerySchema)
    expect(schema.headers).toBe(contract.requestHeaderSchema)
  })

  it('maps the request body schema', () => {
    const contract = defineApiContract({
      visibility: 'public',
      method: 'post',
      summary: 'Create a user',
      pathResolver: () => '/users',
      requestBodySchema: z.object({ name: z.string() }),
      responsesByStatusCode: { 201: userSchema },
    })

    expect(buildFastifyApiSchema(contract).body).toBe(contract.requestBodySchema)
  })

  it('omits the body schema for a ContractNoBody request body', () => {
    const contract = defineApiContract({
      visibility: 'public',
      method: 'post',
      summary: 'Ping',
      pathResolver: () => '/ping',
      requestBodySchema: ContractNoBody,
      responsesByStatusCode: { 204: noBodyResponse() },
    })

    expect(buildFastifyApiSchema(contract).body).toBeUndefined()
  })

  it('omits request schemas the contract does not declare', () => {
    const contract = defineApiContract({
      visibility: 'public',
      method: 'get',
      summary: 'List users',
      pathResolver: () => '/users',
      responsesByStatusCode: { 200: userSchema },
    })

    const schema = buildFastifyApiSchema(contract)
    expect(schema.params).toBeUndefined()
    expect(schema.querystring).toBeUndefined()
    expect(schema.headers).toBeUndefined()
    expect(schema.body).toBeUndefined()
  })
})

// ============================================================================
// Response schemas
// ============================================================================

describe('buildFastifyApiSchema — response schemas', () => {
  it("passes wildcard status keys ('4xx', 'default') through verbatim", () => {
    // Fastify's serializer recognizes both range keys ('4xx') and 'default'.
    const rangeSchema = z.object({ error: z.string() })
    const defaultSchema = z.object({ fallback: z.string() })
    const contract = defineApiContract({
      visibility: 'public',
      method: 'get',
      summary: 'Get data',
      pathResolver: () => '/data',
      responsesByStatusCode: { 200: userSchema, '4xx': rangeSchema, default: defaultSchema },
    })

    const response = buildFastifyApiSchema(contract).response as Record<string, z.ZodType>
    expect(response['4xx']).toBe(rangeSchema)
    expect(response.default).toBe(defaultSchema)
  })

  it('passes a bare JSON schema through unchanged', () => {
    const contract = defineApiContract({
      visibility: 'public',
      method: 'get',
      summary: 'List users',
      pathResolver: () => '/users',
      responsesByStatusCode: {
        200: userSchema,
        404: z.object({ error: z.string() }),
      },
    })

    const response = buildFastifyApiSchema(contract).response as Record<number, z.ZodType>
    expect(response[200]).toBe(userSchema)
    expect(response[404]).toBe(contract.responsesByStatusCode[404])
  })

  it('maps a no-body status code to a null schema', () => {
    const contract = defineApiContract({
      visibility: 'public',
      method: 'delete',
      summary: 'Delete a user',
      pathResolver: () => '/users',
      responsesByStatusCode: { 204: noBodyResponse() },
    })

    const response = buildFastifyApiSchema(contract).response as Record<number, z.ZodType>
    expect(z.toJSONSchema(response[204]!)).toMatchObject({ type: 'null' })
  })

  it('forwards a no-body description into the null schema', () => {
    const contract = defineApiContract({
      visibility: 'public',
      method: 'delete',
      summary: 'Delete a user',
      pathResolver: () => '/users',
      responsesByStatusCode: { 204: noBodyResponse({ description: 'User deleted' }) },
    })

    const response = buildFastifyApiSchema(contract).response as Record<number, z.ZodType>
    expect(z.toJSONSchema(response[204]!)).toMatchObject({
      type: 'null',
      description: 'User deleted',
    })
  })

  it('describes an SSE status code as a union of event envelopes', () => {
    const contract = defineApiContract({
      visibility: 'public',
      method: 'get',
      summary: 'Stream updates',
      pathResolver: () => '/stream',
      responsesByStatusCode: {
        200: { content: { 'text/event-stream': sseBody(sseEventsSchema) } },
      },
    })

    const response = buildFastifyApiSchema(contract).response as ResponseSchemas
    const sseSchema = response[200]!.content['text/event-stream']!.schema
    expect(z.toJSONSchema(sseSchema)).toMatchObject({
      anyOf: [
        {
          properties: {
            event: { const: 'update' },
            data: { properties: { value: { type: 'number' } } },
          },
          required: ['event', 'data'],
        },
        {
          properties: {
            event: { const: 'done' },
            data: { properties: { total: { type: 'number' } } },
          },
          required: ['event', 'data'],
        },
      ],
    })
  })

  it('describes a single-event sseBody as its event envelope directly (no union)', () => {
    const contract = defineApiContract({
      visibility: 'public',
      method: 'get',
      summary: 'Stream ticks',
      pathResolver: () => '/ticks',
      responsesByStatusCode: {
        200: { content: { 'text/event-stream': sseBody({ tick: z.object({ at: z.string() }) }) } },
      },
    })

    const response = buildFastifyApiSchema(contract).response as ResponseSchemas
    const sseSchema = response[200]!.content['text/event-stream']!.schema
    const jsonSchema = z.toJSONSchema(sseSchema)
    expect(jsonSchema).not.toHaveProperty('anyOf')
    expect(jsonSchema).toMatchObject({
      properties: {
        event: { const: 'tick' },
        data: { properties: { at: { type: 'string' } } },
      },
      required: ['event', 'data'],
    })
  })

  it('throws for an sseBody() without any event schemas', () => {
    const contract = defineApiContract({
      visibility: 'public',
      method: 'get',
      summary: 'Stream nothing',
      pathResolver: () => '/stream',
      responsesByStatusCode: {
        200: { content: { 'text/event-stream': sseBody({}) } },
      },
    })

    expect(() => buildFastifyApiSchema(contract)).toThrow(
      'An sseBody() must declare at least one event schema.',
    )
  })

  it('describes a blob status code with its media type and forwards the description', () => {
    const contract = defineApiContract({
      visibility: 'public',
      method: 'get',
      summary: 'Download report',
      pathResolver: () => '/report.pdf',
      responsesByStatusCode: {
        200: { description: 'The PDF report', content: { 'application/pdf': blobBody() } },
      },
    })

    expect(buildFastifyApiSchema(contract).response).toMatchObject({
      200: {
        description: 'The PDF report',
        content: { 'application/pdf': { schema: expect.any(z.ZodType) } },
      },
    })
  })

  it('keeps each media type of a mixed content map with the JSON schema intact', () => {
    const contract = defineApiContract({
      visibility: 'public',
      method: 'get',
      summary: 'Mixed SSE/JSON endpoint',
      pathResolver: () => '/mixed',
      responsesByStatusCode: {
        200: {
          content: {
            'text/event-stream': sseBody(sseEventsSchema),
            'application/json': userSchema,
          },
        },
      },
    })

    const response = buildFastifyApiSchema(contract).response as ResponseSchemas
    expect(response[200]).toEqual({
      content: {
        'text/event-stream': { schema: expect.any(z.ZodType) },
        'application/json': { schema: userSchema },
      },
    })
  })
})
