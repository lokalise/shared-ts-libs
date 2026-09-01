import { sendByApiContract } from '@lokalise/frontend-http-client'
import { getLocal } from 'mockttp'
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'
import wretch from 'wretch'
import {
  blobContentApiContract,
  blobResponseApiContract,
  deleteApiContractWithNoBodyResponse,
  dualContentApiContract,
  dualModeApiContract,
  dualModeApiContractWithPathParams,
  getApiContract,
  getApiContractWith2xxRange,
  getApiContractWith4xxRange,
  getApiContractWith5xxRange,
  getApiContractWithDefault,
  getApiContractWithExactAndRange,
  getApiContractWithPathAndQueryParams,
  getApiContractWithPathParams,
  getApiContractWithQueryParams,
  getApiContractWithSuccessAndErrorStatuses,
  jsonAndBlobContentApiContract,
  jsonContentApiContract,
  multiJsonContentApiContract,
  noBodyApiContract,
  noBodyContentApiContract,
  patchApiContract,
  postApiContract,
  postApiContractWithPathParams,
  problemJsonContentApiContract,
  putApiContract,
  sseContentApiContract,
  sseGetApiContract,
  sseGetApiContractWithPathParams,
  sseGetApiContractWithQueryParams,
} from '../../test/testApiContracts.ts'
import { ApiContractMockttpHelper } from './ApiContractMockttpHelper.ts'

describe('ApiContractMockttpHelper', () => {
  const mockServer = getLocal()
  const helper = new ApiContractMockttpHelper(mockServer)

  beforeEach(async () => {
    await mockServer.start()
  })
  afterEach(() => mockServer.stop())

  function client() {
    return wretch(mockServer.url)
  }

  describe('mockResponse — REST contracts', () => {
    it('mocks GET without path params', async () => {
      await helper.mockResponse(getApiContract, { responseStatus: 200, responseJson: { id: '1' } })
      const result = await sendByApiContract(client(), getApiContract, {})
      expect(result.result?.body).toEqual({ id: '1' })
    })

    it('enforces GET contract schema (strips unknown properties)', async () => {
      await helper.mockResponse(getApiContract, {
        responseStatus: 200,
        // @ts-expect-error wrong property on responseJson
        responseJson: { id: '1', wrong: 'x' },
      })
      const result = await sendByApiContract(client(), getApiContract, {})
      expect(result.result?.body).toEqual({ id: '1' })
    })

    it('mocks GET with path params', async () => {
      await helper.mockResponse(getApiContractWithPathParams, {
        pathParams: { userId: '3' },
        responseStatus: 200,
        responseJson: { id: '3' },
      })
      const result = await sendByApiContract(client(), getApiContractWithPathParams, {
        pathParams: { userId: '3' },
      })
      expect(result.result?.body).toEqual({ id: '3' })
    })

    it('mocks GET with query params', async () => {
      await helper.mockResponse(getApiContractWithQueryParams, {
        responseStatus: 200,
        responseJson: { id: '1' },
      })
      const result = await sendByApiContract(client(), getApiContractWithQueryParams, {
        queryParams: { yearFrom: 2024 },
      })
      expect(result.result?.body).toEqual({ id: '1' })
    })

    it('mocks GET with path and query params', async () => {
      await helper.mockResponse(getApiContractWithPathAndQueryParams, {
        pathParams: { userId: '3' },
        responseStatus: 200,
        responseJson: { id: '3' },
      })
      const result = await sendByApiContract(client(), getApiContractWithPathAndQueryParams, {
        pathParams: { userId: '3' },
        queryParams: { yearFrom: 2024 },
      })
      expect(result.result?.body).toEqual({ id: '3' })
    })

    it('mocks POST without path params', async () => {
      await helper.mockResponse(postApiContract, { responseStatus: 200, responseJson: { id: '1' } })
      const result = await sendByApiContract(client(), postApiContract, { body: { name: 'test' } })
      expect(result.result?.body).toEqual({ id: '1' })
    })

    it('mocks POST with path params', async () => {
      await helper.mockResponse(postApiContractWithPathParams, {
        pathParams: { userId: '3' },
        responseStatus: 200,
        responseJson: { id: '2' },
      })
      const result = await sendByApiContract(client(), postApiContractWithPathParams, {
        pathParams: { userId: '3' },
        body: { name: 'test' },
      })
      expect(result.result?.body).toEqual({ id: '2' })
    })

    it('mocks no-body DELETE response (204)', async () => {
      await helper.mockResponse(noBodyApiContract, {
        pathParams: { userId: '1' },
        responseStatus: 204,
      })
      const result = await sendByApiContract(client(), noBodyApiContract, {
        pathParams: { userId: '1' },
      })
      expect(result.result?.body).toBeNull()
    })
  })

  describe('mockResponse — SSE contracts', () => {
    it('mocks SSE-only GET response', async () => {
      await helper.mockResponse(sseGetApiContract, {
        responseStatus: 200,
        events: [
          { event: 'item.updated', data: { items: [{ id: '1' }] } },
          { event: 'completed', data: { totalCount: 1 } },
        ],
      })
      const result = await sendByApiContract(client(), sseGetApiContract, {})
      const events: unknown[] = []
      for await (const event of result.result!.body) {
        events.push(event)
      }
      expect(events).toHaveLength(2)
    })

    it('mocks SSE with path params', async () => {
      await helper.mockResponse(sseGetApiContractWithPathParams, {
        pathParams: { userId: '5' },
        responseStatus: 200,
        events: [{ event: 'completed', data: { totalCount: 5 } }],
      })
      const result = await sendByApiContract(client(), sseGetApiContractWithPathParams, {
        pathParams: { userId: '5' },
      })
      const events: unknown[] = []
      for await (const event of result.result!.body) {
        events.push(event)
      }
      expect(events).toHaveLength(1)
    })

    it('mocks SSE with query params', async () => {
      await helper.mockResponse(sseGetApiContractWithQueryParams, {
        responseStatus: 200,
        events: [{ event: 'completed', data: { totalCount: 3 } }],
      })
      const result = await sendByApiContract(client(), sseGetApiContractWithQueryParams, {
        queryParams: { yearFrom: 2024 },
      })
      const events: unknown[] = []
      for await (const event of result.result!.body) {
        events.push(event)
      }
      expect(events).toHaveLength(1)
    })
  })

  describe('mockResponse — dual-mode contracts', () => {
    it('returns JSON when no SSE Accept header', async () => {
      await helper.mockResponse(dualModeApiContract, {
        responseStatus: 200,
        responseJson: { id: '1' },
        events: [{ event: 'completed', data: { totalCount: 1 } }],
      })
      const result = await sendByApiContract(client(), dualModeApiContract, {
        body: { name: 'test' },
        streaming: false,
      })
      expect(result.result?.body).toEqual({ id: '1' })
    })

    it('returns SSE when Accept: text/event-stream', async () => {
      await helper.mockResponse(dualModeApiContract, {
        responseStatus: 200,
        responseJson: { id: '1' },
        events: [{ event: 'completed', data: { totalCount: 1 } }],
      })
      const result = await sendByApiContract<typeof dualModeApiContract, true>(
        client(),
        dualModeApiContract,
        {
          body: { name: 'test' },
          streaming: true,
        },
      )
      const events: unknown[] = []
      for await (const event of result.result!.body) {
        events.push(event)
      }
      expect(events).toHaveLength(1)
    })

    it('mocks dual-mode with path params', async () => {
      await helper.mockResponse(dualModeApiContractWithPathParams, {
        pathParams: { userId: '2' },
        responseStatus: 200,
        responseJson: { id: '2' },
        events: [{ event: 'completed', data: { totalCount: 2 } }],
      })
      const result = await sendByApiContract(client(), dualModeApiContractWithPathParams, {
        pathParams: { userId: '2' },
        body: { name: 'test' },
        streaming: false,
      })
      expect(result.result?.body).toEqual({ id: '2' })
    })
  })

  describe('mockResponse — content-map contracts', () => {
    it('mocks a JSON content entry', async () => {
      await helper.mockResponse(jsonContentApiContract, {
        responseStatus: 200,
        responseJson: { id: '1' },
      })
      const result = await sendByApiContract(client(), jsonContentApiContract, {})
      expect(result.result?.body).toEqual({ id: '1' })
    })

    it('mocks a blob content entry', async () => {
      await helper.mockResponse(blobContentApiContract, {
        responseStatus: 200,
        responseBlob: 'binary-data',
      })
      const result = await sendByApiContract(client(), blobContentApiContract, {})
      expect(await result.result!.body.text()).toBe('binary-data')
    })

    it('mocks an SSE content entry', async () => {
      await helper.mockResponse(sseContentApiContract, {
        responseStatus: 200,
        events: [
          { event: 'item.updated', data: { items: [{ id: '1' }] } },
          { event: 'completed', data: { totalCount: 1 } },
        ],
      })
      const result = await sendByApiContract(client(), sseContentApiContract, {})
      const events: unknown[] = []
      for await (const event of result.result!.body) {
        events.push(event)
      }
      expect(events).toHaveLength(2)
    })

    it('returns JSON for a dual content entry when not streaming', async () => {
      await helper.mockResponse(dualContentApiContract, {
        responseStatus: 200,
        responseJson: { id: '1' },
        events: [{ event: 'completed', data: { totalCount: 1 } }],
      })
      const result = await sendByApiContract(client(), dualContentApiContract, {
        body: { name: 'test' },
        streaming: false,
      })
      expect(result.result?.body).toEqual({ id: '1' })
    })

    it('returns SSE for a dual content entry when streaming', async () => {
      await helper.mockResponse(dualContentApiContract, {
        responseStatus: 200,
        responseJson: { id: '1' },
        events: [{ event: 'completed', data: { totalCount: 1 } }],
      })
      const result = await sendByApiContract<typeof dualContentApiContract, true>(
        client(),
        dualContentApiContract,
        { body: { name: 'test' }, streaming: true },
      )
      const events: unknown[] = []
      for await (const event of result.result!.body) {
        events.push(event)
      }
      expect(events).toHaveLength(1)
    })

    it('mocks a no-body content entry', async () => {
      await helper.mockResponse(noBodyContentApiContract, {
        pathParams: { userId: '1' },
        responseStatus: 204,
      })
      const result = await sendByApiContract(client(), noBodyContentApiContract, {
        pathParams: { userId: '1' },
      })
      expect(result.result?.body).toBeNull()
    })
  })

  describe('mockResponse — explicit contentType', () => {
    it('serves the selected JSON content type', async () => {
      await helper.mockResponse(multiJsonContentApiContract, {
        responseStatus: 200,
        contentType: 'application/problem+json',
        responseJson: { title: 'Invalid', detail: 'Something went wrong' },
      })
      const response = await fetch(`${mockServer.url}/content-multi-json`)
      expect(response.headers.get('content-type')).toBe('application/problem+json')
      expect(await response.json()).toEqual({ title: 'Invalid', detail: 'Something went wrong' })
    })

    it('serves the first JSON content type when contentType is omitted', async () => {
      await helper.mockResponse(multiJsonContentApiContract, {
        responseStatus: 200,
        responseJson: { id: '1' },
      })
      const response = await fetch(`${mockServer.url}/content-multi-json`)
      expect(response.headers.get('content-type')).toBe('application/json')
      expect(await response.json()).toEqual({ id: '1' })
    })

    it('serves the blob entry when selected over JSON', async () => {
      await helper.mockResponse(jsonAndBlobContentApiContract, {
        responseStatus: 200,
        contentType: 'application/octet-stream',
        responseBlob: 'binary-data',
      })
      const response = await fetch(`${mockServer.url}/content-json-blob`)
      expect(response.headers.get('content-type')).toBe('application/octet-stream')
      expect(await response.text()).toBe('binary-data')
    })

    it('serves the JSON entry when selected next to a blob entry', async () => {
      await helper.mockResponse(jsonAndBlobContentApiContract, {
        responseStatus: 200,
        contentType: 'application/json',
        responseJson: { id: '9' },
      })
      const response = await fetch(`${mockServer.url}/content-json-blob`)
      expect(response.headers.get('content-type')).toBe('application/json')
      expect(await response.json()).toEqual({ id: '9' })
    })

    it('serves SSE without Accept negotiation when text/event-stream is selected', async () => {
      await helper.mockResponse(dualContentApiContract, {
        responseStatus: 200,
        contentType: 'text/event-stream',
        events: [{ event: 'completed', data: { totalCount: 1 } }],
      })
      const response = await fetch(`${mockServer.url}/content-dual`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'test' }),
      })
      expect(response.headers.get('content-type')).toBe('text/event-stream')
      expect(await response.text()).toContain('event: completed')
    })

    it('mocks only the JSON entry of a dual content map', async () => {
      await helper.mockResponse(dualContentApiContract, {
        responseStatus: 200,
        contentType: 'application/json',
        responseJson: { id: '1' },
      })
      const result = await sendByApiContract(client(), dualContentApiContract, {
        body: { name: 'test' },
        streaming: false,
      })
      expect(result.result?.body).toEqual({ id: '1' })
    })

    it('throws when contentType is not declared in the contract', async () => {
      await expect(
        helper.mockResponse(multiJsonContentApiContract, {
          responseStatus: 200,
          // @ts-expect-error contentType not declared in the contract
          contentType: 'text/plain',
          responseJson: { id: '1' },
        }),
      ).rejects.toThrow('Specified contentType cannot be mapped with contract')
    })
  })

  describe('mockResponse — range / wildcard status key fallback', () => {
    it('resolves response entry via range key when exact code is absent', async () => {
      await helper.mockResponse(getApiContractWith2xxRange, {
        responseStatus: 201,
        responseJson: { id: '42' },
      })
      const result = await sendByApiContract(client(), getApiContractWith2xxRange, {})
      expect(result.result?.body).toEqual({ id: '42' })
    })

    it('resolves response entry via default key when no exact or range key matches', async () => {
      await helper.mockResponse(getApiContractWithDefault, {
        responseStatus: 200,
        responseJson: { id: '7' },
      })
      const result = await sendByApiContract(client(), getApiContractWithDefault, {})
      expect(result.result?.body).toEqual({ id: '7' })
    })

    it('exact key takes priority over range key', async () => {
      await helper.mockResponse(getApiContractWithExactAndRange, {
        responseStatus: 200,
        responseJson: { id: 'exact' },
      })
      const result = await sendByApiContract(client(), getApiContractWithExactAndRange, {})
      expect(result.result?.body).toEqual({ id: 'exact' })
    })

    it('range key is used when exact code is absent but range matches', async () => {
      await helper.mockResponse(getApiContractWithExactAndRange, {
        responseStatus: 201,
        responseJson: { id: 'range', created: true },
      })
      const result = await sendByApiContract(client(), getApiContractWithExactAndRange, {})
      expect(result.result?.body).toEqual({ id: 'range', created: true })
    })
  })

  describe('mockResponse — NoBodyResponse', () => {
    it('replies with no body for noBodyResponse() entry', async () => {
      await helper.mockResponse(deleteApiContractWithNoBodyResponse, { responseStatus: 204 })
      const response = await client().url('/no-body').delete().res()
      expect(response.status).toBe(204)
    })
  })

  describe('mockResponse — HTTP methods', () => {
    it('mocks PATCH request', async () => {
      await helper.mockResponse(patchApiContract, {
        responseStatus: 200,
        responseJson: { id: '1' },
      })
      const result = await sendByApiContract(client(), patchApiContract, { body: { name: 'test' } })
      expect(result.result?.body).toEqual({ id: '1' })
    })

    it('mocks PUT request', async () => {
      await helper.mockResponse(putApiContract, { responseStatus: 200, responseJson: { id: '2' } })
      const result = await sendByApiContract(client(), putApiContract, { body: { name: 'test' } })
      expect(result.result?.body).toEqual({ id: '2' })
    })
  })

  describe('mockResponse — non-JSON response types', () => {
    it('mocks blob response', async () => {
      await helper.mockResponse(blobResponseApiContract, {
        responseStatus: 200,
        responseBlob: 'binary-data',
      })
      const response = await client().url('/blob').get().res()
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('application/octet-stream')
    })
  })

  describe('mockResponse — error handling', () => {
    it('throws when responseStatus cannot be mapped with contract', async () => {
      await expect(
        // @ts-expect-error testing runtime error path with status code not in contract
        helper.mockResponse(getApiContract, { responseStatus: 999, responseJson: { id: 'x' } }),
      ).rejects.toThrow('Specified responseStatus cannot be mapped with contract')
    })
  })

  describe('mockResponse — extended range / wildcard status key fallback', () => {
    it('resolves response entry via 4xx range key', async () => {
      await helper.mockResponse(getApiContractWith4xxRange, {
        responseStatus: 404,
        responseJson: { id: 'not-found' },
      })
      const response = await fetch(`${mockServer.url}/not-found`)
      expect(response.status).toBe(404)
    })

    it('resolves response entry via 5xx range key', async () => {
      await helper.mockResponse(getApiContractWith5xxRange, {
        responseStatus: 503,
        responseJson: { id: 'error' },
      })
      const response = await fetch(`${mockServer.url}/server-error`)
      expect(response.status).toBe(503)
    })
  })

  describe('mockResponseWithImplementation', () => {
    // The helper reports handler and validation failures through console.error, since the
    // frameworks would otherwise bury them in an opaque 500.
    let failureLog: MockInstance<typeof console.error>

    beforeEach(() => {
      failureLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    })
    afterEach(() => {
      vi.restoreAllMocks()
    })

    function loggedFailure(): string {
      return failureLog.mock.calls.map(([message]) => String(message)).join('\n')
    }

    it('derives the response body from the request body', async () => {
      await helper.mockResponseWithImplementation(postApiContract, {
        responseStatus: 200,
        handleRequest: async (request) => {
          const body = await request.body.getJson()
          return { id: `id-${body.name}` }
        },
      })

      const result = await sendByApiContract(client(), postApiContract, {
        body: { name: 'ragnarok' },
      })

      expect(result.result?.body).toEqual({ id: 'id-ragnarok' })
    })

    it('derives the response body from the request path', async () => {
      await helper.mockResponseWithImplementation(getApiContractWithPathParams, {
        pathParams: { userId: '7' },
        responseStatus: 200,
        handleRequest: (request) => ({ id: request.path.split('/').pop() ?? '' }),
      })

      const result = await sendByApiContract(client(), getApiContractWithPathParams, {
        pathParams: { userId: '7' },
      })

      expect(result.result?.body).toEqual({ id: '7' })
    })

    it('strips unknown properties from the handler result', async () => {
      await helper.mockResponseWithImplementation(getApiContract, {
        responseStatus: 200,
        handleRequest: () => ({ id: '1', extra: 'x' }),
      })

      const result = await sendByApiContract(client(), getApiContract, {})

      expect(result.result?.body).toEqual({ id: '1' })
    })

    it('replies with the declared JSON media type, not application/json', async () => {
      await helper.mockResponseWithImplementation(problemJsonContentApiContract, {
        responseStatus: 200,
        handleRequest: () => ({ title: 'Invalid', detail: 'Something went wrong' }),
      })

      const response = await fetch(`${mockServer.url}/content-problem-json`)
      expect(response.headers.get('content-type')).toBe('application/problem+json')

      const result = await sendByApiContract(client(), problemJsonContentApiContract, {})
      expect(result.result?.body).toEqual({ title: 'Invalid', detail: 'Something went wrong' })
    })

    it('serves the JSON media type selected via contentType', async () => {
      await helper.mockResponseWithImplementation(multiJsonContentApiContract, {
        responseStatus: 200,
        contentType: 'application/problem+json',
        handleRequest: () => ({ title: 'Invalid', detail: 'Something went wrong' }),
      })

      const response = await fetch(`${mockServer.url}/content-multi-json`)

      expect(response.headers.get('content-type')).toBe('application/problem+json')
      await expect(response.json()).resolves.toEqual({
        title: 'Invalid',
        detail: 'Something went wrong',
      })
    })

    it('requires contentType when the status declares several JSON media types', async () => {
      await expect(
        helper.mockResponseWithImplementation(
          multiJsonContentApiContract,
          // @ts-expect-error contentType is required when the choice of media type is ambiguous
          { responseStatus: 200, handleRequest: () => ({ id: '1' }) },
        ),
      ).rejects.toThrow(
        'Status 200 declares more than one JSON content type (application/json, application/problem+json); pass contentType to select one',
      )
    })

    it('serves the JSON entry of a content map that also declares a blob', async () => {
      await helper.mockResponseWithImplementation(jsonAndBlobContentApiContract, {
        responseStatus: 200,
        handleRequest: () => ({ id: 'from-json-side' }),
      })

      const response = await fetch(`${mockServer.url}/content-json-blob`)

      expect(response.headers.get('content-type')).toBe('application/json')
      await expect(response.json()).resolves.toEqual({ id: 'from-json-side' })
    })

    it('resolves the body schema through a range status key', async () => {
      await helper.mockResponseWithImplementation(getApiContractWith4xxRange, {
        responseStatus: 404,
        handleRequest: () => ({ id: 'missing' }),
      })

      const response = await fetch(`${mockServer.url}/not-found`)

      expect(response.status).toBe(404)
      await expect(response.json()).resolves.toEqual({ id: 'missing' })
    })

    it('resolves the body schema from a JSON content map', async () => {
      await helper.mockResponseWithImplementation(jsonContentApiContract, {
        responseStatus: 200,
        handleRequest: () => ({ id: 'from-content-map' }),
      })

      const result = await sendByApiContract(client(), jsonContentApiContract, {})

      expect(result.result?.body).toEqual({ id: 'from-content-map' })
    })

    describe('per-call status codes', () => {
      it('validates the body against the entry for the overridden status', async () => {
        let callCount = 0
        await helper.mockResponseWithImplementation(getApiContractWithSuccessAndErrorStatuses, {
          responseStatus: 200,
          handleRequest: () => {
            callCount++
            if (callCount === 1) {
              return ApiContractMockttpHelper.response({ message: 'nope' }, { status: 404 })
            }
            return { id: 'second' }
          },
        })

        const first = await fetch(`${mockServer.url}/success-or-error`)
        expect(first.status).toBe(404)
        await expect(first.json()).resolves.toEqual({ message: 'nope' })

        const second = await fetch(`${mockServer.url}/success-or-error`)
        expect(second.status).toBe(200)
        await expect(second.json()).resolves.toEqual({ id: 'second' })
        expect(failureLog).not.toHaveBeenCalled()
      })

      it('reports an overridden status the contract does not declare', async () => {
        await helper.mockResponseWithImplementation(getApiContract, {
          responseStatus: 200,
          handleRequest: () => ApiContractMockttpHelper.response({ id: '1' }, { status: 503 }),
        })

        const response = await fetch(mockServer.url)

        expect(response.status).toBe(500)
        expect(loggedFailure()).toContain(
          'Status 503 passed to response() cannot be mapped with contract',
        )
      })
    })

    describe('failure reporting', () => {
      it('reports a handler result the contract schema rejects', async () => {
        await helper.mockResponseWithImplementation(getApiContract, {
          responseStatus: 200,
          // @ts-expect-error handler must return the contract response body
          handleRequest: () => ({ wrong: 'x' }),
        })

        const response = await fetch(mockServer.url)

        expect(response.status).toBe(500)
        expect(loggedFailure()).toContain(
          '[ApiContractMockttpHelper.mockResponseWithImplementation]',
        )
        expect(loggedFailure()).toContain('GET /')
        expect(loggedFailure()).toContain('ZodError')
      })

      it('reports an exception thrown by the handler', async () => {
        await helper.mockResponseWithImplementation(getApiContract, {
          responseStatus: 200,
          handleRequest: () => {
            throw new Error('boom from handler')
          },
        })

        const response = await fetch(mockServer.url)

        expect(response.status).toBe(500)
        expect(loggedFailure()).toContain('boom from handler')
        await expect(response.json()).resolves.toEqual({
          message: expect.stringContaining('boom from handler'),
        })
      })

      it('refuses a request that negotiated the status entry SSE branch', async () => {
        await helper.mockResponseWithImplementation(dualContentApiContract, {
          responseStatus: 200,
          handleRequest: () => ({ id: 'json-side' }),
        })

        const negotiated = await fetch(`${mockServer.url}/content-dual`, {
          method: 'POST',
          headers: { accept: 'text/event-stream' },
          body: JSON.stringify({ name: 'x' }),
        })

        expect(negotiated.status).toBe(406)
        expect(loggedFailure()).toContain('use mockResponse for the SSE branch')
      })

      it('serves the JSON branch of a dual content map to a plain request', async () => {
        await helper.mockResponseWithImplementation(dualContentApiContract, {
          responseStatus: 200,
          handleRequest: () => ({ id: 'json-side' }),
        })

        const result = await sendByApiContract(client(), dualContentApiContract, {
          streaming: false,
          body: { name: 'x' },
        })

        expect(result.result?.body).toEqual({ id: 'json-side' })
        expect(failureLog).not.toHaveBeenCalled()
      })
    })

    describe('statuses it refuses to mock', () => {
      // Guards untyped callers, for whom the type-level rejections do not apply.
      const untypedHelper = helper as unknown as {
        mockResponseWithImplementation: (contract: unknown, params: unknown) => Promise<void>
      }

      it('rejects a status the contract does not declare', async () => {
        await expect(
          helper.mockResponseWithImplementation(getApiContract, {
            // @ts-expect-error 418 is not declared on the contract
            responseStatus: 418,
            handleRequest: () => ({ id: '1' }),
          }),
        ).rejects.toThrow('Specified responseStatus cannot be mapped with contract')
      })

      it('rejects an SSE-only status at the type level', async () => {
        await expect(
          helper.mockResponseWithImplementation(
            sseGetApiContract,
            // @ts-expect-error an SSE-only status leaves no JSON body for handleRequest to return
            { responseStatus: 200, handleRequest: () => ({ id: '1' }) },
          ),
        ).rejects.toThrow(
          'Status 200 has no JSON response body; use mockResponse for SSE and blob responses',
        )
      })

      it('rejects a status whose body has no JSON representation at runtime', async () => {
        await expect(
          untypedHelper.mockResponseWithImplementation(blobContentApiContract, {
            responseStatus: 200,
            handleRequest: () => ({ id: '1' }),
          }),
        ).rejects.toThrow(
          'Status 200 has no JSON response body; use mockResponse for SSE and blob responses',
        )
      })

      it('rejects a no-body status without blaming SSE or blob', async () => {
        await expect(
          untypedHelper.mockResponseWithImplementation(noBodyContentApiContract, {
            pathParams: { userId: '7' },
            responseStatus: 204,
            handleRequest: () => ({ id: '1' }),
          }),
        ).rejects.toThrow(
          'Status 204 declares no response body; mockResponseWithImplementation needs a JSON body to return',
        )
      })

      it('rejects a contentType the status does not declare', async () => {
        await expect(
          untypedHelper.mockResponseWithImplementation(jsonContentApiContract, {
            responseStatus: 200,
            contentType: 'text/plain',
            handleRequest: () => ({ id: '1' }),
          }),
        ).rejects.toThrow('Specified contentType cannot be mapped with contract')
      })

      it('rejects a contentType that names a non-JSON descriptor', async () => {
        await expect(
          untypedHelper.mockResponseWithImplementation(jsonAndBlobContentApiContract, {
            responseStatus: 200,
            contentType: 'application/octet-stream',
            handleRequest: () => ({ id: '1' }),
          }),
        ).rejects.toThrow(
          'Specified contentType application/octet-stream is not a JSON body; use mockResponse for SSE and blob responses',
        )
      })
    })
  })
})
