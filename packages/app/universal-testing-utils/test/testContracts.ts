import { buildGetRoute, buildPayloadRoute } from '@lokalise/api-contracts'
import { z } from 'zod'

const REQUEST_BODY_SCHEMA = z.object({
  name: z.string(),
})
const RESPONSE_BODY_SCHEMA = z.object({
  id: z.string(),
})
const PATH_PARAMS_SCHEMA = z.object({
  userId: z.string(),
})
const QUERY_PARAMS_SCHEMA = z.object({
  yearFrom: z.coerce.number(),
})

export const postContract = buildPayloadRoute({
  successResponseBodySchema: RESPONSE_BODY_SCHEMA,
  requestBodySchema: REQUEST_BODY_SCHEMA,
  method: 'post',
  description: 'some description',
  responseSchemasByStatusCode: {
    200: RESPONSE_BODY_SCHEMA,
  },
  pathResolver: () => '/',
})

export const getContract = buildGetRoute({
  successResponseBodySchema: RESPONSE_BODY_SCHEMA,
  description: 'some description',
  responseSchemasByStatusCode: {
    200: RESPONSE_BODY_SCHEMA,
  },
  pathResolver: () => '/',
})

export const getContractWithQueryParams = buildGetRoute({
  successResponseBodySchema: RESPONSE_BODY_SCHEMA,
  description: 'some description',
  requestQuerySchema: QUERY_PARAMS_SCHEMA,
  responseSchemasByStatusCode: {
    200: RESPONSE_BODY_SCHEMA,
  },
  pathResolver: () => '/',
})

export const postContractWithPathParams = buildPayloadRoute({
  successResponseBodySchema: RESPONSE_BODY_SCHEMA,
  requestBodySchema: REQUEST_BODY_SCHEMA,
  requestPathParamsSchema: PATH_PARAMS_SCHEMA,
  method: 'post',
  description: 'some description',
  responseSchemasByStatusCode: {
    200: RESPONSE_BODY_SCHEMA,
  },
  pathResolver: (pathParams) => `/users/${pathParams.userId}`,
})

export const getContractWithPathParams = buildGetRoute({
  successResponseBodySchema: RESPONSE_BODY_SCHEMA,
  requestPathParamsSchema: PATH_PARAMS_SCHEMA,
  description: 'some description',
  responseSchemasByStatusCode: {
    200: RESPONSE_BODY_SCHEMA,
  },
  pathResolver: (pathParams) => `/users/${pathParams.userId}`,
})
