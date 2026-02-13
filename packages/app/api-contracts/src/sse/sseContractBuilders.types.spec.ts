import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import type { AnyDualModeContractDefinition } from './dualModeContracts.ts'
import { buildSseContract } from './sseContractBuilders.ts'
import type { AnySSEContractDefinition } from './sseContracts.ts'

describe('buildSseContract type inference', () => {
  // ============================================================================
  // SSE GET - schemas provided
  // ============================================================================

  describe('SSE GET with all schemas provided', () => {
    it('returns SSEContractDefinition with isSSE: true', () => {
      const contract = buildSseContract({
        method: 'get',
        pathResolver: () => '/api/stream',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        serverSentEventSchemas: { message: z.object({ text: z.string() }) },
      })

      expectTypeOf(contract.isSSE).toEqualTypeOf<true>()
      expectTypeOf(contract.method).toEqualTypeOf<'get'>()
    })

    it('infers path params type from schema', () => {
      const paramsSchema = z.object({ channelId: z.string() })

      const contract = buildSseContract({
        method: 'get',
        pathResolver: (params) => `/api/channels/${params.channelId}/stream`,
        requestPathParamsSchema: paramsSchema,
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        serverSentEventSchemas: { message: z.object({ text: z.string() }) },
      })

      expectTypeOf(contract.requestPathParamsSchema).toEqualTypeOf<
        typeof paramsSchema | undefined
      >()
    })

    it('infers query type from schema', () => {
      const querySchema = z.object({ userId: z.string().optional() })

      const contract = buildSseContract({
        method: 'get',
        pathResolver: () => '/api/stream',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: querySchema,
        requestHeaderSchema: z.object({}),
        serverSentEventSchemas: { message: z.object({ text: z.string() }) },
      })

      expectTypeOf(contract.requestQuerySchema).toEqualTypeOf<typeof querySchema | undefined>()
    })

    it('infers header type from schema', () => {
      const headersSchema = z.object({ authorization: z.string() })

      const contract = buildSseContract({
        method: 'get',
        pathResolver: () => '/api/stream',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: headersSchema,
        serverSentEventSchemas: { message: z.object({ text: z.string() }) },
      })

      expectTypeOf(contract.requestHeaderSchema).toEqualTypeOf<typeof headersSchema | undefined>()
    })

    it('infers event schemas type', () => {
      const events = {
        chunk: z.object({ content: z.string() }),
        done: z.object({ totalTokens: z.number() }),
      }

      const contract = buildSseContract({
        method: 'get',
        pathResolver: () => '/api/stream',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        serverSentEventSchemas: events,
      })

      expectTypeOf(contract.serverSentEventSchemas).toEqualTypeOf(events)
    })

    it('has undefined requestBody for GET routes', () => {
      const contract = buildSseContract({
        method: 'get',
        pathResolver: () => '/api/stream',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        serverSentEventSchemas: { message: z.object({ text: z.string() }) },
      })

      expectTypeOf(contract.requestBodySchema).toEqualTypeOf<undefined>()
    })

    it('satisfies AnySSEContractDefinition', () => {
      const contract = buildSseContract({
        method: 'get',
        pathResolver: () => '/api/stream',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        serverSentEventSchemas: { message: z.object({ text: z.string() }) },
      })

      expectTypeOf(contract).toMatchTypeOf<AnySSEContractDefinition>()
    })
  })

  // ============================================================================
  // SSE GET - schemas omitted
  // ============================================================================

  describe('SSE GET with schemas omitted', () => {
    it('compiles without requestPathParamsSchema, requestQuerySchema, requestHeaderSchema', () => {
      const contract = buildSseContract({
        method: 'get' as const,
        pathResolver: () => '/api/stream',
        serverSentEventSchemas: { message: z.object({ text: z.string() }) },
      })

      expectTypeOf(contract.isSSE).toEqualTypeOf<true>()
    })

    it('omitted schemas accept undefined', () => {
      const contract = buildSseContract({
        method: 'get' as const,
        pathResolver: () => '/api/stream',
        serverSentEventSchemas: { message: z.object({ text: z.string() }) },
      })

      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestPathParamsSchema>()
      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestQuerySchema>()
      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestHeaderSchema>()
    })

    it('satisfies AnySSEContractDefinition when schemas are omitted', () => {
      const contract = buildSseContract({
        method: 'get' as const,
        pathResolver: () => '/api/stream',
        serverSentEventSchemas: { message: z.object({ text: z.string() }) },
      })

      expectTypeOf(contract).toMatchTypeOf<AnySSEContractDefinition>()
    })

    it('allows partial schema omission (only params provided)', () => {
      const paramsSchema = z.object({ id: z.string() })

      const contract = buildSseContract({
        method: 'get' as const,
        pathResolver: (params) => `/api/items/${params.id}/stream`,
        requestPathParamsSchema: paramsSchema,
        serverSentEventSchemas: { data: z.object({ value: z.string() }) },
      })

      expectTypeOf(contract.requestPathParamsSchema).toEqualTypeOf<
        typeof paramsSchema | undefined
      >()
      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestQuerySchema>()
      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestHeaderSchema>()
      expectTypeOf(contract).toMatchTypeOf<AnySSEContractDefinition>()
    })

    it('allows partial schema omission (only headers provided)', () => {
      const headersSchema = z.object({ authorization: z.string() })

      const contract = buildSseContract({
        method: 'get' as const,
        pathResolver: () => '/api/stream',
        requestHeaderSchema: headersSchema,
        serverSentEventSchemas: { data: z.object({ value: z.string() }) },
      })

      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestPathParamsSchema>()
      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestQuerySchema>()
      expectTypeOf(contract.requestHeaderSchema).toEqualTypeOf<typeof headersSchema | undefined>()
      expectTypeOf(contract).toMatchTypeOf<AnySSEContractDefinition>()
    })
  })

  // ============================================================================
  // SSE POST - schemas provided and omitted
  // ============================================================================

  describe('SSE POST with all schemas provided', () => {
    it('returns SSEContractDefinition with isSSE: true', () => {
      const contract = buildSseContract({
        method: 'post',
        pathResolver: () => '/api/process',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        requestBodySchema: z.object({ data: z.string() }),
        serverSentEventSchemas: { progress: z.object({ percent: z.number() }) },
      })

      expectTypeOf(contract.isSSE).toEqualTypeOf<true>()
      expectTypeOf(contract.method).toEqualTypeOf<'post' | 'put' | 'patch'>()
    })

    it('infers all schema types correctly', () => {
      const paramsSchema = z.object({ projectId: z.string() })
      const querySchema = z.object({ verbose: z.string().optional() })
      const headersSchema = z.object({ authorization: z.string() })
      const bodySchema = z.object({ data: z.string() })

      const contract = buildSseContract({
        method: 'post',
        pathResolver: (params) => `/api/projects/${params.projectId}/process`,
        requestPathParamsSchema: paramsSchema,
        requestQuerySchema: querySchema,
        requestHeaderSchema: headersSchema,
        requestBodySchema: bodySchema,
        serverSentEventSchemas: { progress: z.object({ percent: z.number() }) },
      })

      expectTypeOf(contract.requestPathParamsSchema).toEqualTypeOf<
        typeof paramsSchema | undefined
      >()
      expectTypeOf(contract.requestQuerySchema).toEqualTypeOf<typeof querySchema | undefined>()
      expectTypeOf(contract.requestHeaderSchema).toEqualTypeOf<typeof headersSchema | undefined>()
      expectTypeOf(contract.requestBodySchema).toEqualTypeOf(bodySchema)
    })

    it('satisfies AnySSEContractDefinition', () => {
      const contract = buildSseContract({
        method: 'post',
        pathResolver: () => '/api/process',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        requestBodySchema: z.object({ data: z.string() }),
        serverSentEventSchemas: { progress: z.object({ percent: z.number() }) },
      })

      expectTypeOf(contract).toMatchTypeOf<AnySSEContractDefinition>()
    })
  })

  describe('SSE POST with schemas omitted', () => {
    it('compiles without optional schemas', () => {
      const contract = buildSseContract({
        method: 'post' as const,
        pathResolver: () => '/api/process',
        requestBodySchema: z.object({ data: z.string() }),
        serverSentEventSchemas: { progress: z.object({ percent: z.number() }) },
      })

      expectTypeOf(contract.isSSE).toEqualTypeOf<true>()
      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestPathParamsSchema>()
      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestQuerySchema>()
      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestHeaderSchema>()
    })

    it('satisfies AnySSEContractDefinition when schemas are omitted', () => {
      const contract = buildSseContract({
        method: 'post' as const,
        pathResolver: () => '/api/process',
        requestBodySchema: z.object({ data: z.string() }),
        serverSentEventSchemas: { progress: z.object({ percent: z.number() }) },
      })

      expectTypeOf(contract).toMatchTypeOf<AnySSEContractDefinition>()
    })
  })

  // ============================================================================
  // Dual-mode GET - schemas provided and omitted
  // ============================================================================

  describe('Dual-mode GET with all schemas provided', () => {
    it('returns DualModeContractDefinition with isDualMode: true', () => {
      const contract = buildSseContract({
        method: 'get',
        pathResolver: () => '/api/status',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        successResponseBodySchema: z.object({ status: z.string() }),
        serverSentEventSchemas: { update: z.object({ progress: z.number() }) },
      })

      expectTypeOf(contract.isDualMode).toEqualTypeOf<true>()
      expectTypeOf(contract.method).toEqualTypeOf<'get'>()
    })

    it('infers all schema types correctly', () => {
      const paramsSchema = z.object({ jobId: z.string() })
      const querySchema = z.object({ verbose: z.string().optional() })
      const headersSchema = z.object({ authorization: z.string() })
      const syncResponseSchema = z.object({ status: z.string() })

      const contract = buildSseContract({
        method: 'get',
        pathResolver: (params) => `/api/jobs/${params.jobId}/status`,
        requestPathParamsSchema: paramsSchema,
        requestQuerySchema: querySchema,
        requestHeaderSchema: headersSchema,
        successResponseBodySchema: syncResponseSchema,
        serverSentEventSchemas: { update: z.object({ progress: z.number() }) },
      })

      expectTypeOf(contract.requestPathParamsSchema).toEqualTypeOf<
        typeof paramsSchema | undefined
      >()
      expectTypeOf(contract.requestQuerySchema).toEqualTypeOf<typeof querySchema | undefined>()
      expectTypeOf(contract.requestHeaderSchema).toEqualTypeOf<typeof headersSchema | undefined>()
      expectTypeOf(contract.successResponseBodySchema).toEqualTypeOf(syncResponseSchema)
    })

    it('satisfies AnyDualModeContractDefinition', () => {
      const contract = buildSseContract({
        method: 'get',
        pathResolver: () => '/api/status',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        successResponseBodySchema: z.object({ status: z.string() }),
        serverSentEventSchemas: { update: z.object({ progress: z.number() }) },
      })

      expectTypeOf(contract).toMatchTypeOf<AnyDualModeContractDefinition>()
    })
  })

  describe('Dual-mode GET with schemas omitted', () => {
    it('compiles without optional schemas', () => {
      const contract = buildSseContract({
        method: 'get' as const,
        pathResolver: () => '/api/status',
        successResponseBodySchema: z.object({ status: z.string() }),
        serverSentEventSchemas: { update: z.object({ progress: z.number() }) },
      })

      expectTypeOf(contract.isDualMode).toEqualTypeOf<true>()
      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestPathParamsSchema>()
      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestQuerySchema>()
      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestHeaderSchema>()
    })

    it('satisfies AnyDualModeContractDefinition when schemas are omitted', () => {
      const contract = buildSseContract({
        method: 'get' as const,
        pathResolver: () => '/api/status',
        successResponseBodySchema: z.object({ status: z.string() }),
        serverSentEventSchemas: { update: z.object({ progress: z.number() }) },
      })

      expectTypeOf(contract).toMatchTypeOf<AnyDualModeContractDefinition>()
    })

    it('allows partial schema omission (only params provided)', () => {
      const paramsSchema = z.object({ jobId: z.string() })

      const contract = buildSseContract({
        method: 'get' as const,
        pathResolver: (params) => `/api/jobs/${params.jobId}/status`,
        requestPathParamsSchema: paramsSchema,
        successResponseBodySchema: z.object({ status: z.string() }),
        serverSentEventSchemas: { update: z.object({ progress: z.number() }) },
      })

      expectTypeOf(contract.requestPathParamsSchema).toEqualTypeOf<
        typeof paramsSchema | undefined
      >()
      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestQuerySchema>()
      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestHeaderSchema>()
      expectTypeOf(contract).toMatchTypeOf<AnyDualModeContractDefinition>()
    })
  })

  // ============================================================================
  // Dual-mode POST - schemas provided and omitted
  // ============================================================================

  describe('Dual-mode POST with all schemas provided', () => {
    it('returns DualModeContractDefinition with isDualMode: true', () => {
      const contract = buildSseContract({
        method: 'post',
        pathResolver: () => '/api/chat/completions',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        requestBodySchema: z.object({ message: z.string() }),
        successResponseBodySchema: z.object({ reply: z.string() }),
        serverSentEventSchemas: { chunk: z.object({ delta: z.string() }) },
      })

      expectTypeOf(contract.isDualMode).toEqualTypeOf<true>()
      expectTypeOf(contract.method).toEqualTypeOf<'post' | 'put' | 'patch'>()
    })

    it('infers all schema types correctly', () => {
      const paramsSchema = z.object({ chatId: z.string() })
      const querySchema = z.object({ model: z.string().optional() })
      const headersSchema = z.object({ authorization: z.string() })
      const bodySchema = z.object({ message: z.string() })
      const syncResponseSchema = z.object({ reply: z.string() })

      const contract = buildSseContract({
        method: 'post',
        pathResolver: (params) => `/api/chats/${params.chatId}/completions`,
        requestPathParamsSchema: paramsSchema,
        requestQuerySchema: querySchema,
        requestHeaderSchema: headersSchema,
        requestBodySchema: bodySchema,
        successResponseBodySchema: syncResponseSchema,
        serverSentEventSchemas: { chunk: z.object({ delta: z.string() }) },
      })

      expectTypeOf(contract.requestPathParamsSchema).toEqualTypeOf<
        typeof paramsSchema | undefined
      >()
      expectTypeOf(contract.requestQuerySchema).toEqualTypeOf<typeof querySchema | undefined>()
      expectTypeOf(contract.requestHeaderSchema).toEqualTypeOf<typeof headersSchema | undefined>()
      expectTypeOf(contract.requestBodySchema).toEqualTypeOf(bodySchema)
      expectTypeOf(contract.successResponseBodySchema).toEqualTypeOf(syncResponseSchema)
    })

    it('satisfies AnyDualModeContractDefinition', () => {
      const contract = buildSseContract({
        method: 'post',
        pathResolver: () => '/api/chat/completions',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        requestBodySchema: z.object({ message: z.string() }),
        successResponseBodySchema: z.object({ reply: z.string() }),
        serverSentEventSchemas: { chunk: z.object({ delta: z.string() }) },
      })

      expectTypeOf(contract).toMatchTypeOf<AnyDualModeContractDefinition>()
    })
  })

  describe('Dual-mode POST with schemas omitted', () => {
    it('compiles without optional schemas', () => {
      const contract = buildSseContract({
        method: 'post' as const,
        pathResolver: () => '/api/chat/completions',
        requestBodySchema: z.object({ message: z.string() }),
        successResponseBodySchema: z.object({ reply: z.string() }),
        serverSentEventSchemas: { chunk: z.object({ delta: z.string() }) },
      })

      expectTypeOf(contract.isDualMode).toEqualTypeOf<true>()
      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestPathParamsSchema>()
      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestQuerySchema>()
      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestHeaderSchema>()
    })

    it('satisfies AnyDualModeContractDefinition when schemas are omitted', () => {
      const contract = buildSseContract({
        method: 'post' as const,
        pathResolver: () => '/api/chat/completions',
        requestBodySchema: z.object({ message: z.string() }),
        successResponseBodySchema: z.object({ reply: z.string() }),
        serverSentEventSchemas: { chunk: z.object({ delta: z.string() }) },
      })

      expectTypeOf(contract).toMatchTypeOf<AnyDualModeContractDefinition>()
    })
  })

  // ============================================================================
  // z.infer safety — the core regression scenario
  // ============================================================================

  describe('z.infer on optional schema properties', () => {
    it('z.infer resolves correctly when params schema is provided', () => {
      const contract = buildSseContract({
        method: 'get' as const,
        pathResolver: (params) => `/api/items/${params.id}/stream`,
        requestPathParamsSchema: z.object({ id: z.string() }),
        serverSentEventSchemas: { data: z.object({ value: z.string() }) },
      })

      // When provided, z.infer should resolve to the correct type
      type ParamsSchema = NonNullable<typeof contract.requestPathParamsSchema>
      type Params = z.infer<ParamsSchema>
      expectTypeOf<Params>().toEqualTypeOf<{ id: string }>()
    })

    it('z.infer resolves correctly when header schema is provided', () => {
      const contract = buildSseContract({
        method: 'get' as const,
        pathResolver: () => '/api/stream',
        requestHeaderSchema: z.object({ authorization: z.string() }),
        serverSentEventSchemas: { data: z.object({ value: z.string() }) },
      })

      type HeaderSchema = NonNullable<typeof contract.requestHeaderSchema>
      type Headers = z.infer<HeaderSchema>
      expectTypeOf<Headers>().toEqualTypeOf<{ authorization: string }>()
    })

    it('z.infer resolves correctly when query schema is provided', () => {
      const contract = buildSseContract({
        method: 'get' as const,
        pathResolver: () => '/api/stream',
        requestQuerySchema: z.object({ limit: z.number() }),
        serverSentEventSchemas: { data: z.object({ value: z.string() }) },
      })

      type QuerySchema = NonNullable<typeof contract.requestQuerySchema>
      type Query = z.infer<QuerySchema>
      expectTypeOf<Query>().toEqualTypeOf<{ limit: number }>()
    })

    it('bare conditional z.infer always resolves to unknown for optional properties', () => {
      // Without NonNullable, the conditional pattern always gives unknown
      // because `ZodObject | undefined` does not extend `ZodTypeAny`
      const contractWithSchemas = buildSseContract({
        method: 'get' as const,
        pathResolver: (params) => `/api/items/${params.id}/stream`,
        requestPathParamsSchema: z.object({ id: z.string() }),
        serverSentEventSchemas: { data: z.object({ value: z.string() }) },
      })

      type BareParams = (typeof contractWithSchemas)['requestPathParamsSchema'] extends z.ZodTypeAny
        ? z.infer<(typeof contractWithSchemas)['requestPathParamsSchema']>
        : unknown

      // This resolves to unknown even though the schema IS provided — this is expected
      // because the property type is `ZodObject | undefined`, not `ZodObject`
      expectTypeOf<BareParams>().toBeUnknown()
    })

    it('NonNullable + conditional z.infer pattern resolves correctly when schema is provided', () => {
      const contract = buildSseContract({
        method: 'get' as const,
        pathResolver: (params) => `/api/items/${params.id}/stream`,
        requestPathParamsSchema: z.object({ id: z.string() }),
        requestQuerySchema: z.object({ limit: z.number() }),
        requestHeaderSchema: z.object({ authorization: z.string() }),
        serverSentEventSchemas: { data: z.object({ value: z.string() }) },
      })

      // Since properties are optional (Schema | undefined), consumers must use NonNullable
      // before the extends check. Bare `Contract['schema'] extends z.ZodTypeAny` fails
      // because `ZodObject | undefined` does not extend `z.ZodTypeAny`.
      type SafeParams =
        NonNullable<(typeof contract)['requestPathParamsSchema']> extends z.ZodTypeAny
          ? z.infer<NonNullable<(typeof contract)['requestPathParamsSchema']>>
          : unknown
      type SafeQuery =
        NonNullable<(typeof contract)['requestQuerySchema']> extends z.ZodTypeAny
          ? z.infer<NonNullable<(typeof contract)['requestQuerySchema']>>
          : unknown
      type SafeHeaders =
        NonNullable<(typeof contract)['requestHeaderSchema']> extends z.ZodTypeAny
          ? z.infer<NonNullable<(typeof contract)['requestHeaderSchema']>>
          : unknown

      expectTypeOf<SafeParams>().toEqualTypeOf<{ id: string }>()
      expectTypeOf<SafeQuery>().toEqualTypeOf<{ limit: number }>()
      expectTypeOf<SafeHeaders>().toEqualTypeOf<{ authorization: string }>()
    })

    it('NonNullable + conditional z.infer resolves to unknown when schema is omitted', () => {
      const contract = buildSseContract({
        method: 'get' as const,
        pathResolver: () => '/api/stream',
        serverSentEventSchemas: { data: z.object({ value: z.string() }) },
      })

      // When omitted, NonNullable strips undefined, leaving ZodTypeAny.
      // z.infer<ZodTypeAny> = unknown — which is the correct fallback.
      type SafeParams =
        NonNullable<(typeof contract)['requestPathParamsSchema']> extends z.ZodTypeAny
          ? z.infer<NonNullable<(typeof contract)['requestPathParamsSchema']>>
          : unknown
      type SafeQuery =
        NonNullable<(typeof contract)['requestQuerySchema']> extends z.ZodTypeAny
          ? z.infer<NonNullable<(typeof contract)['requestQuerySchema']>>
          : unknown
      type SafeHeaders =
        NonNullable<(typeof contract)['requestHeaderSchema']> extends z.ZodTypeAny
          ? z.infer<NonNullable<(typeof contract)['requestHeaderSchema']>>
          : unknown

      expectTypeOf<SafeParams>().toBeUnknown()
      expectTypeOf<SafeQuery>().toBeUnknown()
      expectTypeOf<SafeHeaders>().toBeUnknown()
    })
  })

  // ============================================================================
  // responseBodySchemasByStatusCode
  // ============================================================================

  describe('responseBodySchemasByStatusCode type inference', () => {
    it('infers status code schemas for SSE contracts', () => {
      const contract = buildSseContract({
        method: 'get',
        pathResolver: () => '/api/stream',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        serverSentEventSchemas: { message: z.object({ text: z.string() }) },
        responseBodySchemasByStatusCode: {
          401: z.object({ error: z.literal('Unauthorized') }),
          404: z.object({ error: z.string() }),
        },
      })

      expectTypeOf(contract.responseBodySchemasByStatusCode).not.toBeUndefined()
    })

    it('infers status code schemas for dual-mode contracts', () => {
      const contract = buildSseContract({
        method: 'post',
        pathResolver: () => '/api/chat',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        requestBodySchema: z.object({ message: z.string() }),
        successResponseBodySchema: z.object({ reply: z.string() }),
        serverSentEventSchemas: { chunk: z.object({ delta: z.string() }) },
        responseBodySchemasByStatusCode: {
          400: z.object({ error: z.string(), details: z.array(z.string()) }),
        },
      })

      expectTypeOf(contract.responseBodySchemasByStatusCode).not.toBeUndefined()
    })
  })

  // ============================================================================
  // Contract type discrimination
  // ============================================================================

  describe('contract type discrimination', () => {
    it('SSE contracts have isSSE but not isDualMode', () => {
      const contract = buildSseContract({
        method: 'get',
        pathResolver: () => '/api/stream',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        serverSentEventSchemas: { message: z.object({ text: z.string() }) },
      })

      expectTypeOf(contract.isSSE).toEqualTypeOf<true>()
      expectTypeOf(contract).not.toHaveProperty('isDualMode')
    })

    it('Dual-mode contracts have isDualMode but not isSSE', () => {
      const contract = buildSseContract({
        method: 'get',
        pathResolver: () => '/api/status',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        successResponseBodySchema: z.object({ status: z.string() }),
        serverSentEventSchemas: { update: z.object({ progress: z.number() }) },
      })

      expectTypeOf(contract.isDualMode).toEqualTypeOf<true>()
      expectTypeOf(contract).not.toHaveProperty('isSSE')
    })

    it('SSE contract with omitted schemas still has isSSE', () => {
      const contract = buildSseContract({
        method: 'get' as const,
        pathResolver: () => '/api/stream',
        serverSentEventSchemas: { message: z.object({ text: z.string() }) },
      })

      expectTypeOf(contract.isSSE).toEqualTypeOf<true>()
    })

    it('Dual-mode contract with omitted schemas still has isDualMode', () => {
      const contract = buildSseContract({
        method: 'get' as const,
        pathResolver: () => '/api/status',
        successResponseBodySchema: z.object({ status: z.string() }),
        serverSentEventSchemas: { update: z.object({ progress: z.number() }) },
      })

      expectTypeOf(contract.isDualMode).toEqualTypeOf<true>()
    })
  })
})
