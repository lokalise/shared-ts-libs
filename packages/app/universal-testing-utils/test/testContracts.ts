import { buildRestContract } from '@lokalise/api-contracts'
import { z } from 'zod/v4'

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

export const postContract = buildRestContract({
  method: 'post',
  successResponseBodySchema: RESPONSE_BODY_SCHEMA,
  requestBodySchema: REQUEST_BODY_SCHEMA,
  description: 'some description',
  responseSchemasByStatusCode: {
    200: RESPONSE_BODY_SCHEMA,
  },
  pathResolver: () => '/',
})

export const getContract = buildRestContract({
  method: 'get',
  successResponseBodySchema: RESPONSE_BODY_SCHEMA,
  description: 'some description',
  responseSchemasByStatusCode: {
    200: RESPONSE_BODY_SCHEMA,
  },
  pathResolver: () => '/',
})

export const getContractWithQueryParams = buildRestContract({
  method: 'get',
  successResponseBodySchema: RESPONSE_BODY_SCHEMA,
  description: 'some description',
  requestQuerySchema: QUERY_PARAMS_SCHEMA,
  responseSchemasByStatusCode: {
    200: RESPONSE_BODY_SCHEMA,
  },
  pathResolver: () => '/',
})

export const postContractWithPathParams = buildRestContract({
  method: 'post',
  successResponseBodySchema: RESPONSE_BODY_SCHEMA,
  requestBodySchema: REQUEST_BODY_SCHEMA,
  requestPathParamsSchema: PATH_PARAMS_SCHEMA,
  description: 'some description',
  responseSchemasByStatusCode: {
    200: RESPONSE_BODY_SCHEMA,
  },
  pathResolver: (pathParams) => `/users/${pathParams.userId}`,
})

export const getContractWithPathParams = buildRestContract({
  method: 'get',
  successResponseBodySchema: RESPONSE_BODY_SCHEMA,
  requestPathParamsSchema: PATH_PARAMS_SCHEMA,
  description: 'some description',
  responseSchemasByStatusCode: {
    200: RESPONSE_BODY_SCHEMA,
  },
  pathResolver: (pathParams) => `/users/${pathParams.userId}`,
})

export const getContractWithPathAndQueryParams = buildRestContract({
  method: 'get',
  successResponseBodySchema: RESPONSE_BODY_SCHEMA,
  requestPathParamsSchema: PATH_PARAMS_SCHEMA,
  requestQuerySchema: QUERY_PARAMS_SCHEMA,
  description: 'some description',
  responseSchemasByStatusCode: {
    200: RESPONSE_BODY_SCHEMA,
  },
  pathResolver: (pathParams) => `/users/${pathParams.userId}`,
})
