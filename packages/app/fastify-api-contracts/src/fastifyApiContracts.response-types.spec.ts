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
  status: z.literal('success'),
})

const ErrorResponseSchema = z.object({
  error: z.string(),
  status: z.literal('error'),
})

const ValidationErrorSchema = z.object({
  errors: z.array(z.string()),
  status: z.literal('validation_error'),
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
    400: ErrorResponseSchema,
    422: ValidationErrorSchema,
  },
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
  },
})

// Test route where success schema is also included in responseSchemasByStatusCode
const _getRouteWithDuplicateSuccess = buildGetRoute({
  pathResolver: () => '/duplicate-success',
  successResponseBodySchema: SuccessResponseSchema,
  responseSchemasByStatusCode: {
    200: SuccessResponseSchema,
    400: ErrorResponseSchema,
    422: ValidationErrorSchema,
  },
})

const _postRouteWithMultipleResponses = buildPayloadRoute({
  method: 'post' as const,
  pathResolver: () => '/test',
  requestBodySchema: z.object({ input: z.string() }),
  successResponseBodySchema: SuccessResponseSchema,
  responseSchemasByStatusCode: {
    400: ErrorResponseSchema,
    422: ValidationErrorSchema,
  },
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
  },
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
  describe('GET endpoint with multiple response types', () => {
    it('should return success response', async () => {
      const getHandler = buildFastifyNoPayloadRouteHandler(
        getRouteWithMultipleResponses,
        async (request, reply) => {
          // this should pass, it is coming from ErrorResponseSchema
          if (request.query.input === 'error') {
            await reply.status(400).send({
              error: 'error',
              status: 'error' as const,
            })
            return
          }

          // this should not pass, field dummy does not exist, and status is not supported by any schema either
          if (request.query.input === 'invalid_error') {
            await reply.status(400).send({
              dummy: 'error',
              //@ts-expect-error This does not correspond to any schema
              status: 'invalid' as const,
            })
            return
          }

          await reply.status(200).send({
            data: 'success',
            status: 'success' as const,
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
        status: 'success',
      })

      await app.close()
    })
  })
})
