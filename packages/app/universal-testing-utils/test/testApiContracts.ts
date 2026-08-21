import { blobBody, defineApiContract, noBodyResponse, sseBody } from '@lokalise/api-contracts'
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
  visibility: 'public',
  summary: 'Test contract',
  method: 'get',
  pathResolver: () => '/',
  responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
})

export const getApiContractWithPathParams = defineApiContract({
  visibility: 'public',
  summary: 'Test contract',
  method: 'get',
  requestPathParamsSchema: PATH_PARAMS_SCHEMA,
  pathResolver: ({ userId }) => `/users/${userId}`,
  responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
})

export const getApiContractWithQueryParams = defineApiContract({
  visibility: 'public',
  summary: 'Test contract',
  method: 'get',
  requestQuerySchema: QUERY_PARAMS_SCHEMA,
  pathResolver: () => '/',
  responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
})

export const getApiContractWithPathAndQueryParams = defineApiContract({
  visibility: 'public',
  summary: 'Test contract',
  method: 'get',
  requestPathParamsSchema: PATH_PARAMS_SCHEMA,
  requestQuerySchema: QUERY_PARAMS_SCHEMA,
  pathResolver: ({ userId }) => `/users/${userId}`,
  responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
})

export const postApiContract = defineApiContract({
  visibility: 'public',
  summary: 'Test contract',
  method: 'post',
  requestBodySchema: REQUEST_BODY_SCHEMA,
  pathResolver: () => '/',
  responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
})

export const postApiContractWithPathParams = defineApiContract({
  visibility: 'public',
  summary: 'Test contract',
  method: 'post',
  requestBodySchema: REQUEST_BODY_SCHEMA,
  requestPathParamsSchema: PATH_PARAMS_SCHEMA,
  pathResolver: ({ userId }) => `/users/${userId}`,
  responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
})

export const sseGetApiContract = defineApiContract({
  visibility: 'public',
  summary: 'Test contract',
  method: 'get',
  pathResolver: () => '/events/stream',
  responsesByStatusCode: { 200: { content: { 'text/event-stream': sseBody(SSE_SCHEMAS) } } },
})

export const sseGetApiContractWithPathParams = defineApiContract({
  visibility: 'public',
  summary: 'Test contract',
  method: 'get',
  requestPathParamsSchema: PATH_PARAMS_SCHEMA,
  pathResolver: ({ userId }) => `/users/${userId}/events`,
  responsesByStatusCode: { 200: { content: { 'text/event-stream': sseBody(SSE_SCHEMAS) } } },
})

export const sseGetApiContractWithQueryParams = defineApiContract({
  visibility: 'public',
  summary: 'Test contract',
  method: 'get',
  requestQuerySchema: QUERY_PARAMS_SCHEMA,
  pathResolver: () => '/events/stream',
  responsesByStatusCode: { 200: { content: { 'text/event-stream': sseBody(SSE_SCHEMAS) } } },
})

export const dualModeApiContract = defineApiContract({
  visibility: 'public',
  summary: 'Test contract',
  method: 'post',
  requestBodySchema: REQUEST_BODY_SCHEMA,
  pathResolver: () => '/events/dual',
  responsesByStatusCode: {
    200: {
      content: {
        'application/json': RESPONSE_BODY_SCHEMA,
        'text/event-stream': sseBody(SSE_SCHEMAS),
      },
    },
  },
})

export const dualModeApiContractWithPathParams = defineApiContract({
  visibility: 'public',
  summary: 'Test contract',
  method: 'post',
  requestBodySchema: REQUEST_BODY_SCHEMA,
  requestPathParamsSchema: PATH_PARAMS_SCHEMA,
  pathResolver: ({ userId }) => `/users/${userId}/events/dual`,
  responsesByStatusCode: {
    200: {
      content: {
        'application/json': RESPONSE_BODY_SCHEMA,
        'text/event-stream': sseBody(SSE_SCHEMAS),
      },
    },
  },
})

export const noBodyApiContract = defineApiContract({
  visibility: 'public',
  summary: 'Test contract',
  method: 'delete',
  requestPathParamsSchema: PATH_PARAMS_SCHEMA,
  pathResolver: ({ userId }) => `/users/${userId}`,
  responsesByStatusCode: { 204: noBodyResponse() },
})

export const getApiContractWith2xxRange = defineApiContract({
  visibility: 'public',
  summary: 'Test contract',
  method: 'get',
  pathResolver: () => '/range',
  responsesByStatusCode: { '2xx': RESPONSE_BODY_SCHEMA },
})

export const getApiContractWithDefault = defineApiContract({
  visibility: 'public',
  summary: 'Test contract',
  method: 'get',
  pathResolver: () => '/default',
  responsesByStatusCode: { default: RESPONSE_BODY_SCHEMA },
})

const CREATED_BODY_SCHEMA = z.object({ id: z.string(), created: z.literal(true) })

export const getApiContractWithExactAndRange = defineApiContract({
  visibility: 'public',
  summary: 'Test contract',
  method: 'get',
  pathResolver: () => '/exact-and-range',
  responsesByStatusCode: {
    200: RESPONSE_BODY_SCHEMA,
    '2xx': CREATED_BODY_SCHEMA,
  },
})

export const deleteApiContractWithNoBodyResponse = defineApiContract({
  visibility: 'public',
  summary: 'Test contract',
  method: 'delete',
  pathResolver: () => '/no-body',
  responsesByStatusCode: { 204: noBodyResponse() },
})

export const patchApiContract = defineApiContract({
  visibility: 'public',
  summary: 'Test contract',
  method: 'patch',
  requestBodySchema: REQUEST_BODY_SCHEMA,
  pathResolver: () => '/patch',
  responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
})

export const putApiContract = defineApiContract({
  visibility: 'public',
  summary: 'Test contract',
  method: 'put',
  requestBodySchema: REQUEST_BODY_SCHEMA,
  pathResolver: () => '/put',
  responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
})

export const blobResponseApiContract = defineApiContract({
  visibility: 'public',
  summary: 'Test contract',
  method: 'get',
  pathResolver: () => '/blob',
  responsesByStatusCode: { 200: { content: { 'application/octet-stream': blobBody() } } },
})

export const jsonContentApiContract = defineApiContract({
  visibility: 'public',
  summary: 'Test contract',
  method: 'get',
  pathResolver: () => '/content-json',
  responsesByStatusCode: { 200: { content: { 'application/json': RESPONSE_BODY_SCHEMA } } },
})

export const blobContentApiContract = defineApiContract({
  visibility: 'public',
  summary: 'Test contract',
  method: 'get',
  pathResolver: () => '/content-blob',
  responsesByStatusCode: { 200: { content: { 'application/octet-stream': blobBody() } } },
})

export const sseContentApiContract = defineApiContract({
  visibility: 'public',
  summary: 'Test contract',
  method: 'get',
  pathResolver: () => '/content-sse',
  responsesByStatusCode: { 200: { content: { 'text/event-stream': sseBody(SSE_SCHEMAS) } } },
})

export const dualContentApiContract = defineApiContract({
  visibility: 'public',
  summary: 'Test contract',
  method: 'post',
  requestBodySchema: REQUEST_BODY_SCHEMA,
  pathResolver: () => '/content-dual',
  responsesByStatusCode: {
    200: {
      content: {
        'application/json': RESPONSE_BODY_SCHEMA,
        'text/event-stream': sseBody(SSE_SCHEMAS),
      },
    },
  },
})

const PROBLEM_BODY_SCHEMA = z.object({ title: z.string(), detail: z.string() })

export const multiJsonContentApiContract = defineApiContract({
  visibility: 'public',
  summary: 'Test contract',
  method: 'get',
  pathResolver: () => '/content-multi-json',
  responsesByStatusCode: {
    200: {
      content: {
        'application/json': RESPONSE_BODY_SCHEMA,
        'application/problem+json': PROBLEM_BODY_SCHEMA,
      },
    },
  },
})

export const jsonAndBlobContentApiContract = defineApiContract({
  visibility: 'public',
  summary: 'Test contract',
  method: 'get',
  pathResolver: () => '/content-json-blob',
  responsesByStatusCode: {
    200: {
      content: {
        'application/json': RESPONSE_BODY_SCHEMA,
        'application/octet-stream': blobBody(),
      },
    },
  },
})

export const noBodyContentApiContract = defineApiContract({
  visibility: 'public',
  summary: 'Test contract',
  method: 'delete',
  requestPathParamsSchema: PATH_PARAMS_SCHEMA,
  pathResolver: ({ userId }) => `/content-no-body/${userId}`,
  responsesByStatusCode: { 204: { allowNoBody: true } },
})

export const getApiContractWith4xxRange = defineApiContract({
  visibility: 'public',
  summary: 'Test contract',
  method: 'get',
  pathResolver: () => '/not-found',
  responsesByStatusCode: { '4xx': RESPONSE_BODY_SCHEMA },
})

export const getApiContractWith5xxRange = defineApiContract({
  visibility: 'public',
  summary: 'Test contract',
  method: 'get',
  pathResolver: () => '/server-error',
  responsesByStatusCode: { '5xx': RESPONSE_BODY_SCHEMA },
})
