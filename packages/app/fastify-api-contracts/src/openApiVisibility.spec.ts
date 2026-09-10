import fastifySwagger from '@fastify/swagger'
import { defineApiContract } from '@lokalise/api-contracts'
import { fastify } from 'fastify'
import {
  createJsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import { describe, expect, it, onTestFinished } from 'vitest'
import { z } from 'zod/v4'
import { buildFastifyApiRoute } from './buildFastifyApiRoute.ts'

const BODY_SCHEMA = z.object({})

const publicContract = defineApiContract({
  visibility: 'public',
  summary: 'Public resource',
  method: 'get',
  pathResolver: () => '/public-resource',
  responsesByStatusCode: { 200: BODY_SCHEMA },
})

const internalContract = defineApiContract({
  visibility: 'internal',
  summary: 'Internal resource',
  method: 'get',
  pathResolver: () => '/internal-resource',
  responsesByStatusCode: { 200: BODY_SCHEMA },
})

describe('OpenAPI generation with route visibility', () => {
  it('excludes internal routes from the generated OpenAPI document', async () => {
    const app = fastify()
    app.setValidatorCompiler(validatorCompiler)
    app.setSerializerCompiler(serializerCompiler)
    await app.register(fastifySwagger, {
      transform: createJsonSchemaTransform({}),
      openapi: { info: { title: 'test', version: '1.0.0' } },
    })
    app.route(
      buildFastifyApiRoute(publicContract, () => Promise.resolve({ status: 200, body: {} })),
    )
    app.route(
      buildFastifyApiRoute(internalContract, () => Promise.resolve({ status: 200, body: {} })),
    )
    await app.ready()
    onTestFinished(() => app.close())

    const openApiDoc = app.swagger()

    expect(openApiDoc.paths).toHaveProperty('/public-resource')
    expect(openApiDoc.paths).not.toHaveProperty('/internal-resource')
  })
})
