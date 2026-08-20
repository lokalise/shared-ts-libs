import fastifySwagger from '@fastify/swagger'
import { buildRestContract } from '@lokalise/api-contracts'
import { fastify } from 'fastify'
import {
  createJsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import { describe, expect, it, onTestFinished } from 'vitest'
import { z } from 'zod/v4'
import { buildFastifyRoute } from './fastifyRouteBuilder.ts'

const BODY_SCHEMA = z.object({})

const publicContract = buildRestContract({
  visibility: 'public',
  method: 'get',
  successResponseBodySchema: BODY_SCHEMA,
  pathResolver: () => '/public-resource',
})

const internalContract = buildRestContract({
  method: 'get',
  successResponseBodySchema: BODY_SCHEMA,
  pathResolver: () => '/internal-resource',
  visibility: 'internal',
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
    app.route(buildFastifyRoute(publicContract, () => Promise.resolve({})))
    app.route(buildFastifyRoute(internalContract, () => Promise.resolve({})))
    await app.ready()
    onTestFinished(() => app.close())

    const openApiDoc = app.swagger()

    expect(openApiDoc.paths).toHaveProperty('/public-resource')
    expect(openApiDoc.paths).not.toHaveProperty('/internal-resource')
  })
})
