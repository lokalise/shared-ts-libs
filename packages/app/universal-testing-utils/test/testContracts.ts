import { buildRestContract, buildSseContract } from '@lokalise/api-contracts'
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

// SSE contracts

const SSE_ITEM_UPDATED_SCHEMA = z.object({
  items: z.array(z.object({ id: z.string() })),
})
const SSE_COMPLETED_SCHEMA = z.object({
  totalCount: z.number(),
})

export const sseGetContract = buildSseContract({
  method: 'get',
  description: 'SSE GET contract',
  pathResolver: () => '/events/stream',
  serverSentEventSchemas: {
    'item.updated': SSE_ITEM_UPDATED_SCHEMA,
    completed: SSE_COMPLETED_SCHEMA,
  },
})

export const ssePostContract = buildSseContract({
  method: 'post',
  description: 'SSE POST contract',
  pathResolver: () => '/events/stream',
  requestBodySchema: REQUEST_BODY_SCHEMA,
  serverSentEventSchemas: {
    'item.updated': SSE_ITEM_UPDATED_SCHEMA,
    completed: SSE_COMPLETED_SCHEMA,
  },
})

export const sseGetContractWithPathParams = buildSseContract({
  method: 'get',
  description: 'SSE GET contract with path params',
  requestPathParamsSchema: PATH_PARAMS_SCHEMA,
  pathResolver: (pathParams) => `/users/${pathParams.userId}/events`,
  serverSentEventSchemas: {
    'item.updated': SSE_ITEM_UPDATED_SCHEMA,
    completed: SSE_COMPLETED_SCHEMA,
  },
})

export const sseGetContractWithQueryParams = buildSseContract({
  method: 'get',
  description: 'SSE GET contract with query params',
  pathResolver: () => '/events/stream',
  requestQuerySchema: QUERY_PARAMS_SCHEMA,
  serverSentEventSchemas: {
    'item.updated': SSE_ITEM_UPDATED_SCHEMA,
    completed: SSE_COMPLETED_SCHEMA,
  },
})

export const sseDualModeContract = buildSseContract({
  method: 'post',
  description: 'Dual mode SSE contract',
  pathResolver: () => '/events/dual',
  requestBodySchema: REQUEST_BODY_SCHEMA,
  successResponseBodySchema: RESPONSE_BODY_SCHEMA,
  serverSentEventSchemas: {
    'item.updated': SSE_ITEM_UPDATED_SCHEMA,
    completed: SSE_COMPLETED_SCHEMA,
  },
})

export const sseDualModeContractWithPathParams = buildSseContract({
  method: 'post',
  description: 'Dual mode SSE contract with path params',
  requestPathParamsSchema: PATH_PARAMS_SCHEMA,
  pathResolver: (pathParams) => `/users/${pathParams.userId}/events/dual`,
  requestBodySchema: REQUEST_BODY_SCHEMA,
  successResponseBodySchema: RESPONSE_BODY_SCHEMA,
  serverSentEventSchemas: {
    'item.updated': SSE_ITEM_UPDATED_SCHEMA,
    completed: SSE_COMPLETED_SCHEMA,
  },
})
