import {
  anyOfResponses,
  ContractNoBody,
  defineApiContract,
  sseResponse,
} from '@lokalise/api-contracts'
import { z } from 'zod/v4'

const RESPONSE_BODY_SCHEMA = z.object({ id: z.string() })
const REQUEST_BODY_SCHEMA = z.object({ name: z.string() })
const PATH_PARAMS_SCHEMA = z.object({ userId: z.string() })
const QUERY_PARAMS_SCHEMA = z.object({ yearFrom: z.coerce.number() })
const SSE_ITEM_SCHEMA = z.object({ items: z.array(z.object({ id: z.string() })) })
const SSE_COMPLETED_SCHEMA = z.object({ totalCount: z.number() })

const SSE_SCHEMAS = {
  'item.updated': SSE_ITEM_SCHEMA,
  completed: SSE_COMPLETED_SCHEMA,
}

export const getApiContract = defineApiContract({
  method: 'get',
  pathResolver: () => '/',
  responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
})

export const getApiContractWithPathParams = defineApiContract({
  method: 'get',
  requestPathParamsSchema: PATH_PARAMS_SCHEMA,
  pathResolver: ({ userId }) => `/users/${userId}`,
  responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
})

export const getApiContractWithQueryParams = defineApiContract({
  method: 'get',
  requestQuerySchema: QUERY_PARAMS_SCHEMA,
  pathResolver: () => '/',
  responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
})

export const getApiContractWithPathAndQueryParams = defineApiContract({
  method: 'get',
  requestPathParamsSchema: PATH_PARAMS_SCHEMA,
  requestQuerySchema: QUERY_PARAMS_SCHEMA,
  pathResolver: ({ userId }) => `/users/${userId}`,
  responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
})

export const postApiContract = defineApiContract({
  method: 'post',
  requestBodySchema: REQUEST_BODY_SCHEMA,
  pathResolver: () => '/',
  responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
})

export const postApiContractWithPathParams = defineApiContract({
  method: 'post',
  requestBodySchema: REQUEST_BODY_SCHEMA,
  requestPathParamsSchema: PATH_PARAMS_SCHEMA,
  pathResolver: ({ userId }) => `/users/${userId}`,
  responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
})

export const sseGetApiContract = defineApiContract({
  method: 'get',
  pathResolver: () => '/events/stream',
  responsesByStatusCode: { 200: sseResponse(SSE_SCHEMAS) },
})

export const sseGetApiContractWithPathParams = defineApiContract({
  method: 'get',
  requestPathParamsSchema: PATH_PARAMS_SCHEMA,
  pathResolver: ({ userId }) => `/users/${userId}/events`,
  responsesByStatusCode: { 200: sseResponse(SSE_SCHEMAS) },
})

export const sseGetApiContractWithQueryParams = defineApiContract({
  method: 'get',
  requestQuerySchema: QUERY_PARAMS_SCHEMA,
  pathResolver: () => '/events/stream',
  responsesByStatusCode: { 200: sseResponse(SSE_SCHEMAS) },
})

export const dualModeApiContract = defineApiContract({
  method: 'post',
  requestBodySchema: REQUEST_BODY_SCHEMA,
  pathResolver: () => '/events/dual',
  responsesByStatusCode: {
    200: anyOfResponses([sseResponse(SSE_SCHEMAS), RESPONSE_BODY_SCHEMA]),
  },
})

export const dualModeApiContractWithPathParams = defineApiContract({
  method: 'post',
  requestBodySchema: REQUEST_BODY_SCHEMA,
  requestPathParamsSchema: PATH_PARAMS_SCHEMA,
  pathResolver: ({ userId }) => `/users/${userId}/events/dual`,
  responsesByStatusCode: {
    200: anyOfResponses([sseResponse(SSE_SCHEMAS), RESPONSE_BODY_SCHEMA]),
  },
})

export const noBodyApiContract = defineApiContract({
  method: 'delete',
  requestPathParamsSchema: PATH_PARAMS_SCHEMA,
  pathResolver: ({ userId }) => `/users/${userId}`,
  responsesByStatusCode: { 204: ContractNoBody },
})
