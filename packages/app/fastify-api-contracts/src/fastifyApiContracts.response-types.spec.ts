import { buildGetRoute } from '@lokalise/api-contracts'
import { fastify } from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
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
  },
})

const getRouteWithSingleResponse = buildGetRoute({
  pathResolver: () => '/test',
  successResponseBodySchema: SuccessResponseSchema,
  requestQuerySchema: z.object({
    input: z.string(),
  }),
})

async function initApp<Route extends RouteType>(route: Route) {
  const app = fastify({
    logger: false,
    disableRequestLogging: true,
  })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

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
    it('should return responses according to defined schemas, when using buildFastifyNoPayloadRouteHandler', async () => {
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
            await reply.status(200).send({
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

      const response200 = await app.inject({
        method: 'GET',
        url: '/test',
        query: {
          input: 'data',
        },
      })
      expect(response200.statusCode).toBe(200)

      const response400 = await app.inject({
        method: 'GET',
        url: '/test',
        query: {
          input: 'error',
        },
      })
      expect(response400.statusCode).toBe(400)

      const response422 = await app.inject({
        method: 'GET',
        url: '/test',
        query: {
          input: 'validation',
        },
      })
      expect(response422.statusCode).toBe(422)

      const response500 = await app.inject({
        method: 'GET',
        url: '/test',
        query: {
          input: 'invalid_error',
        },
      })
      expect(response500.statusCode).toBe(500)

      await app.close()
    })

      it('should return responses according to defined schemas, when using buildFastifyNoPayloadRoute', async () => {
          const route = buildFastifyNoPayloadRoute(getRouteWithMultipleResponses, async (request, reply) => {
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
                      await reply.status(200).send({
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

          const app = await initApp(route)

          const response200 = await app.inject({
              method: 'GET',
              url: '/test',
              query: {
                  input: 'data',
              },
          })
          expect(response200.statusCode).toBe(200)

          const response400 = await app.inject({
              method: 'GET',
              url: '/test',
              query: {
                  input: 'error',
              },
          })
          expect(response400.statusCode).toBe(400)

          const response422 = await app.inject({
              method: 'GET',
              url: '/test',
              query: {
                  input: 'validation',
              },
          })
          expect(response422.statusCode).toBe(422)

          const response500 = await app.inject({
              method: 'GET',
              url: '/test',
              query: {
                  input: 'invalid_error',
              },
          })
          expect(response500.statusCode).toBe(500)

          await app.close()
      })
  })

  describe('GET endpoint with single response type', () => {
    it('should return responses according to defined schemas', async () => {
      const getHandler = buildFastifyNoPayloadRouteHandler(
        getRouteWithSingleResponse,
        async (request, reply) => {
          if (request.query!.input === 'error') {
            reply.code(200)
            await reply.send({
              //@ts-expect-error Invalid response - these fields don't exist in any schema
              error: 'error',
            })
            return
          }

          if (request.query!.input === 'validation') {
            reply.code(200)
            await reply.send({
              //@ts-expect-error Invalid response - these fields don't exist in any schema
              errors: ['validation error'],
            })
            return
          }

          // Test with invalid response
          if (request.query!.input === 'invalid_error') {
            await reply.status(200).send({
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

      const route = buildFastifyNoPayloadRoute(getRouteWithSingleResponse, getHandler)
      const app = await initApp(route)

      const response200 = await app.inject({
        method: 'GET',
        url: '/test',
        query: {
          input: 'data',
        },
      })
      expect(response200.statusCode).toBe(200)

      const response500a = await app.inject({
        method: 'GET',
        url: '/test',
        query: {
          input: 'error',
        },
      })
      // ToDo should use success schema for validation when map is not defined
      expect(response500a.statusCode).toBe(200)

      const response500b = await app.inject({
        method: 'GET',
        url: '/test',
        query: {
          input: 'validation',
        },
      })
      // ToDo should use success schema for validation when map is not defined
      expect(response500b.statusCode).toBe(200)

      const response500c = await app.inject({
        method: 'GET',
        url: '/test',
        query: {
          input: 'invalid_error',
        },
      })
      // ToDo should use success schema for validation when map is not defined
      expect(response500c.statusCode).toBe(200)

      await app.close()
    })
  })
})
