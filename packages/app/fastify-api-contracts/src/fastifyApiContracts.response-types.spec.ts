import { buildGetRoute, buildPayloadRoute } from '@lokalise/api-contracts'
import { fastify } from 'fastify'
import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import {
  buildFastifyNoPayloadRoute,
  buildFastifyNoPayloadRouteHandler,
} from './fastifyApiContracts.js'
import type { RouteType } from './types.js'

// Test schemas
const SuccessResponseSchema = z.object({
  data: z.string(),
})

const ErrorResponseSchema = z.object({
  error: z.string(),
})

const ValidationErrorSchema = z.object({
  errors: z.array(z.string()),
})

const NotFoundSchema = z.object({
  message: z.string(),
  status: z.literal('not_found'),
})

// Test route with multiple response schemas
const getRouteWithMultipleResponses = buildGetRoute({
  pathResolver: () => '/test',
  successResponseBodySchema: SuccessResponseSchema,
  requestQuerySchema: z.object({
    input: z.string(),
  }),
  responseSchemasByStatusCode: {
    200: SuccessResponseSchema,
    400: ErrorResponseSchema,
    422: ValidationErrorSchema,
  } as const,
})

// Test route with only success response schema (no responseSchemasByStatusCode)
const _getRouteSuccessOnly = buildGetRoute({
  pathResolver: () => '/success-only',
  successResponseBodySchema: SuccessResponseSchema,
})

// Test route with no success response schema (undefined), only responseSchemasByStatusCode
const _getRouteErrorsOnly = buildGetRoute({
  pathResolver: () => '/errors-only',
  successResponseBodySchema: undefined,
  responseSchemasByStatusCode: {
    400: ErrorResponseSchema,
    404: NotFoundSchema,
  } as const,
})

// Test route where success schema is also included in responseSchemasByStatusCode
const _getRouteWithDuplicateSuccess = buildGetRoute({
  pathResolver: () => '/duplicate-success',
  successResponseBodySchema: SuccessResponseSchema,
  responseSchemasByStatusCode: {
    200: SuccessResponseSchema,
    400: ErrorResponseSchema,
    422: ValidationErrorSchema,
  } as const,
})

const _postRouteWithMultipleResponses = buildPayloadRoute({
  method: 'post' as const,
  pathResolver: () => '/test',
  requestBodySchema: z.object({ input: z.string() }),
  successResponseBodySchema: SuccessResponseSchema,
  responseSchemasByStatusCode: {
    400: ErrorResponseSchema,
    422: ValidationErrorSchema,
  } as const,
})

// POST route with only success response schema
const _postRouteSuccessOnly = buildPayloadRoute({
  method: 'post' as const,
  pathResolver: () => '/success-only',
  requestBodySchema: z.object({ data: z.string() }),
  successResponseBodySchema: SuccessResponseSchema,
})

// POST route with no success response schema, only responseSchemasByStatusCode
const _postRouteErrorsOnly = buildPayloadRoute({
  method: 'post' as const,
  pathResolver: () => '/errors-only',
  requestBodySchema: z.object({ action: z.string() }),
  successResponseBodySchema: undefined,
  responseSchemasByStatusCode: {
    400: ErrorResponseSchema,
    404: NotFoundSchema,
  } as const,
})

async function initApp<Route extends RouteType>(route: Route) {
  const app = fastify({
    logger: false,
    disableRequestLogging: true,
  })

  // Simple validation that just passes through - focusing on response type testing
  app.setValidatorCompiler(() => () => true)
  app.setSerializerCompiler(() => (data) => JSON.stringify(data))

  app.route(route)
  await app.ready()
  return app
}

describe('Response types with multiple status codes', () => {
  describe('Type validation', () => {
    it('should type-check union of all response schemas', () => {
      // With the union type approach, all response schemas are accepted
      // but the type checking is permissive - any of the schemas can be sent
      // regardless of the status code
      const handler = buildFastifyNoPayloadRouteHandler(
        getRouteWithMultipleResponses,
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: this is a test
        async (request, reply) => {
          // All response schemas are accepted
          if (request.query!.input === 'data') {
            await reply.send({ data: 'test' })
          }

          if (request.query!.input === 'error') {
            await reply.send({ error: 'test' })
          }

          if (request.query!.input === 'errors') {
            await reply.send({ errors: ['test'] })
          }

          if (request.query!.input === 'errors_invalid') {
            // @ts-expect-error this is invalid type
            await reply.send({ errors: 'test' })
          }

          if (request.query!.input === 'invalid') {
            // @ts-expect-error - Invalid response structure
            await reply.send({ invalid: 'field' })
          }
        },
      )
      expect(handler).toBeDefined()
    })
  })

  describe('GET endpoint with multiple response types', () => {
    it('should return success response', async () => {
      const getHandler = buildFastifyNoPayloadRouteHandler(
        getRouteWithMultipleResponses,
        async (request, reply) => {
          // With union types, we can send any of the defined response types
          // The status code should still be set appropriately for semantic correctness
          // but TypeScript won't enforce matching status codes to response types
          if (request.query!.input === 'error') {
            reply.code(400)
            await reply.send({
              error: 'error',
            })
            return
          }

          if (request.query!.input === 'validation') {
            reply.code(422)
            await reply.send({
              errors: ['validation error'],
            })
            return
          }

          // Test with invalid response
          if (request.query!.input === 'invalid_error') {
            // This should be caught as an error
            reply.code(400)
            await reply.send({
              //@ts-expect-error Invalid response - these fields don't exist in any schema
              completely: 'wrong',
              fields: 'here',
            })
            return
          }

          reply.code(200)
          await reply.send({
            data: 'success',
          })
        },
      )

      const route = buildFastifyNoPayloadRoute(getRouteWithMultipleResponses, getHandler)
      const app = await initApp(route)

      const response = await app.inject({
        method: 'GET',
        url: '/test',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        data: 'success',
      })

      await app.close()
    })
  })
})
