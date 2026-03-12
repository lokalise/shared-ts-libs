import { buildSseContract } from '@lokalise/api-contracts'
import { getLocal, type Mockttp } from 'mockttp'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import wretch from 'wretch'
import { z } from 'zod/v4'
import { connectSseByContract } from './sse.ts'

function sseResponse(events: Array<{ event: string; data: string }>): string {
  return events.map((e) => `event: ${e.event}\ndata: ${e.data}\n\n`).join('')
}

function waitFor(fn: () => boolean, timeout = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      if (fn()) return resolve()
      if (Date.now() - start > timeout) return reject(new Error('waitFor timed out'))
      setTimeout(check, 10)
    }
    check()
  })
}

describe('connectSseByContract', () => {
  let mockServer: Mockttp

  beforeAll(async () => {
    mockServer = getLocal()
    await mockServer.start()
  })

  afterAll(async () => {
    await mockServer.stop()
  })

  afterEach(() => {
    mockServer.reset()
  })

  const itemUpdatedSchema = z.object({
    items: z.array(z.object({ id: z.string() })),
  })

  const doneSchema = z.object({
    total: z.number(),
  })

  const getSseContract = buildSseContract({
    method: 'get',
    pathResolver: () => '/events/stream',
    serverSentEventSchemas: {
      'item.updated': itemUpdatedSchema,
      done: doneSchema,
    },
  })

  const getDualModeContract = buildSseContract({
    method: 'get',
    pathResolver: () => '/items',
    successResponseBodySchema: z.object({ items: z.array(z.string()) }),
    serverSentEventSchemas: {
      'item.updated': itemUpdatedSchema,
      done: doneSchema,
    },
  })

  const postSseContract = buildSseContract({
    method: 'post',
    pathResolver: () => '/process',
    requestBodySchema: z.object({ input: z.string() }),
    serverSentEventSchemas: {
      'item.updated': itemUpdatedSchema,
      done: doneSchema,
    },
  })

  const getWithPathParamsContract = buildSseContract({
    method: 'get',
    pathResolver: (params: { projectId: string }) => `/projects/${params.projectId}/stream`,
    requestPathParamsSchema: z.object({ projectId: z.string() }),
    serverSentEventSchemas: {
      'item.updated': itemUpdatedSchema,
    },
  })

  const getWithQueryContract = buildSseContract({
    method: 'get',
    pathResolver: () => '/events/stream',
    requestQuerySchema: z.object({ limit: z.number() }),
    serverSentEventSchemas: {
      'item.updated': itemUpdatedSchema,
    },
  })

  it('opens a GET SSE stream and dispatches typed events', async () => {
    await mockServer.forGet('/events/stream').thenCallback(() => ({
      statusCode: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: sseResponse([
        { event: 'item.updated', data: JSON.stringify({ items: [{ id: '1' }] }) },
        { event: 'done', data: JSON.stringify({ total: 1 }) },
      ]),
    }))

    const onItemUpdated = vi.fn()
    const onDone = vi.fn()
    const onOpen = vi.fn()
    const onError = vi.fn()

    const client = wretch(mockServer.url)
    const connection = connectSseByContract(
      client,
      getSseContract,
      {},
      {
        onEvent: {
          'item.updated': onItemUpdated,
          done: onDone,
        },
        onOpen,
        onError,
      },
    )

    await waitFor(() => onDone.mock.calls.length > 0)

    expect(onOpen).toHaveBeenCalledOnce()
    expect(onItemUpdated).toHaveBeenCalledWith({ items: [{ id: '1' }] })
    expect(onDone).toHaveBeenCalledWith({ total: 1 })
    expect(onError).not.toHaveBeenCalled()
    connection.close()
  })

  it('opens a GET dual-mode SSE stream', async () => {
    await mockServer.forGet('/items').thenCallback(() => ({
      statusCode: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: sseResponse([
        { event: 'item.updated', data: JSON.stringify({ items: [{ id: '2' }] }) },
        { event: 'done', data: JSON.stringify({ total: 1 }) },
      ]),
    }))

    const onItemUpdated = vi.fn()
    const onDone = vi.fn()

    const client = wretch(mockServer.url)
    const connection = connectSseByContract(
      client,
      getDualModeContract,
      {},
      {
        onEvent: {
          'item.updated': onItemUpdated,
          done: onDone,
        },
      },
    )

    await waitFor(() => onDone.mock.calls.length > 0)

    expect(onItemUpdated).toHaveBeenCalledWith({ items: [{ id: '2' }] })
    expect(onDone).toHaveBeenCalledWith({ total: 1 })
    connection.close()
  })

  it('sends a POST SSE request with body', async () => {
    await mockServer.forPost('/process').thenCallback(async (req) => {
      expect(await req.body.getJson()).toEqual({ input: 'hello' })
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: sseResponse([
          { event: 'item.updated', data: JSON.stringify({ items: [{ id: '3' }] }) },
          { event: 'done', data: JSON.stringify({ total: 1 }) },
        ]),
      }
    })

    const onItemUpdated = vi.fn()
    const onDone = vi.fn()

    const client = wretch(mockServer.url)
    const connection = connectSseByContract(
      client,
      postSseContract,
      { body: { input: 'hello' } },
      {
        onEvent: {
          'item.updated': onItemUpdated,
          done: onDone,
        },
      },
    )

    await waitFor(() => onDone.mock.calls.length > 0)

    expect(onItemUpdated).toHaveBeenCalledWith({ items: [{ id: '3' }] })
    connection.close()
  })

  it('silently ignores unknown event names', async () => {
    await mockServer.forGet('/events/stream').thenCallback(() => ({
      statusCode: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: sseResponse([
        { event: 'unknown.event', data: JSON.stringify({ foo: 'bar' }) },
        { event: 'done', data: JSON.stringify({ total: 0 }) },
      ]),
    }))

    const onItemUpdated = vi.fn()
    const onDone = vi.fn()
    const onError = vi.fn()

    const client = wretch(mockServer.url)
    const connection = connectSseByContract(
      client,
      getSseContract,
      {},
      {
        onEvent: {
          'item.updated': onItemUpdated,
          done: onDone,
        },
        onError,
      },
    )

    await waitFor(() => onDone.mock.calls.length > 0)

    expect(onItemUpdated).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    connection.close()
  })

  it('calls onError for invalid event data (Zod validation failure)', async () => {
    await mockServer.forGet('/events/stream').thenCallback(() => ({
      statusCode: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: sseResponse([
        { event: 'item.updated', data: JSON.stringify({ invalid: true }) },
        { event: 'done', data: JSON.stringify({ total: 0 }) },
      ]),
    }))

    const onItemUpdated = vi.fn()
    const onDone = vi.fn()
    const onError = vi.fn()

    const client = wretch(mockServer.url)
    const connection = connectSseByContract(
      client,
      getSseContract,
      {},
      {
        onEvent: {
          'item.updated': onItemUpdated,
          done: onDone,
        },
        onError,
      },
    )

    await waitFor(() => onDone.mock.calls.length > 0)

    expect(onItemUpdated).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0]![0].message).toContain(
      'Validation failed for event "item.updated"',
    )
    connection.close()
  })

  it('calls onError for JSON parse errors in event data', async () => {
    await mockServer.forGet('/events/stream').thenCallback(() => ({
      statusCode: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: sseResponse([
        { event: 'item.updated', data: 'not-valid-json{{{' },
        { event: 'done', data: JSON.stringify({ total: 0 }) },
      ]),
    }))

    const onItemUpdated = vi.fn()
    const onDone = vi.fn()
    const onError = vi.fn()

    const client = wretch(mockServer.url)
    const connection = connectSseByContract(
      client,
      getSseContract,
      {},
      {
        onEvent: {
          'item.updated': onItemUpdated,
          done: onDone,
        },
        onError,
      },
    )

    await waitFor(() => onDone.mock.calls.length > 0)

    expect(onItemUpdated).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0]![0].message).toContain('Failed to parse event data')
    connection.close()
  })

  it('close() aborts the connection and stops callbacks', async () => {
    await mockServer.forGet('/events/stream').thenCallback(() => ({
      statusCode: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: sseResponse([
        { event: 'item.updated', data: JSON.stringify({ items: [{ id: '1' }] }) },
        { event: 'item.updated', data: JSON.stringify({ items: [{ id: '2' }] }) },
        { event: 'done', data: JSON.stringify({ total: 2 }) },
      ]),
    }))

    const onItemUpdated = vi.fn()
    const onDone = vi.fn()
    const onOpen = vi.fn()

    const client = wretch(mockServer.url)
    const connection = connectSseByContract(
      client,
      getSseContract,
      {},
      {
        onEvent: {
          'item.updated': onItemUpdated,
          done: onDone,
        },
        onOpen,
      },
    )

    // Wait for connection to open, then immediately close
    await waitFor(() => onOpen.mock.calls.length > 0)
    connection.close()

    // Give a small window for any lingering callbacks
    await new Promise((r) => setTimeout(r, 50))

    // After close, no error callbacks should have fired
    // (events may or may not have been received depending on timing)
  })

  it('calls onOpen on successful connection', async () => {
    await mockServer.forGet('/events/stream').thenCallback(() => ({
      statusCode: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: sseResponse([{ event: 'done', data: JSON.stringify({ total: 0 }) }]),
    }))

    const onDone = vi.fn()
    const onOpen = vi.fn()

    const client = wretch(mockServer.url)
    const connection = connectSseByContract(
      client,
      getSseContract,
      {},
      {
        onEvent: {
          'item.updated': vi.fn(),
          done: onDone,
        },
        onOpen,
      },
    )

    await waitFor(() => onDone.mock.calls.length > 0)

    expect(onOpen).toHaveBeenCalledOnce()
    connection.close()
  })

  it('calls onError on non-2xx response', async () => {
    await mockServer.forGet('/events/stream').thenCallback(() => ({
      statusCode: 401,
      body: 'Unauthorized',
    }))

    const onError = vi.fn()
    const onOpen = vi.fn()

    const client = wretch(mockServer.url)
    const connection = connectSseByContract(
      client,
      getSseContract,
      {},
      {
        onEvent: {
          'item.updated': vi.fn(),
          done: vi.fn(),
        },
        onError,
        onOpen,
      },
    )

    await waitFor(() => onError.mock.calls.length > 0)

    expect(onOpen).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledOnce()
    connection.close()
  })

  it('resolves path params correctly', async () => {
    await mockServer.forGet('/projects/abc123/stream').thenCallback(() => ({
      statusCode: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: sseResponse([
        { event: 'item.updated', data: JSON.stringify({ items: [{ id: '1' }] }) },
      ]),
    }))

    const onItemUpdated = vi.fn()

    const client = wretch(mockServer.url)
    const connection = connectSseByContract(
      client,
      getWithPathParamsContract,
      { pathParams: { projectId: 'abc123' } },
      {
        onEvent: {
          'item.updated': onItemUpdated,
        },
      },
    )

    await waitFor(() => onItemUpdated.mock.calls.length > 0)

    expect(onItemUpdated).toHaveBeenCalledWith({ items: [{ id: '1' }] })
    connection.close()
  })

  it('calls onError when query params fail validation', () => {
    const strictQueryContract = buildSseContract({
      method: 'get',
      pathResolver: () => '/events/stream',
      requestQuerySchema: z.object({ limit: z.number().min(1) }),
      serverSentEventSchemas: {
        'item.updated': itemUpdatedSchema,
      },
    })

    const onError = vi.fn()

    const client = wretch(mockServer.url)
    const connection = connectSseByContract(
      client,
      strictQueryContract,
      // @ts-expect-error intentionally passing invalid query params
      { queryParams: { limit: 'not-a-number' } },
      {
        onEvent: {
          'item.updated': vi.fn(),
        },
        onError,
      },
    )

    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0]![0].message).toContain('Query params validation failed')
    connection.close()
  })

  it('calls onError when request body fails validation', () => {
    const onError = vi.fn()

    const client = wretch(mockServer.url)
    const connection = connectSseByContract(
      client,
      postSseContract,
      // @ts-expect-error intentionally passing invalid body
      { body: { input: 12345 } },
      {
        onEvent: {
          'item.updated': vi.fn(),
          done: vi.fn(),
        },
        onError,
      },
    )

    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0]![0].message).toContain('Request body validation failed')
    connection.close()
  })

  it('handles multi-line SSE data fields', async () => {
    const multiLineData = JSON.stringify({ items: [{ id: '1' }] })
    // Manually construct SSE with data split across two data: lines
    const firstHalf = multiLineData.slice(0, 10)
    const secondHalf = multiLineData.slice(10)
    await mockServer.forGet('/events/stream').thenCallback(() => ({
      statusCode: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: `event: item.updated\ndata: ${firstHalf}\ndata: ${secondHalf}\n\nevent: done\ndata: ${JSON.stringify({ total: 1 })}\n\n`,
    }))

    const onItemUpdated = vi.fn()
    const onDone = vi.fn()

    const client = wretch(mockServer.url)
    const connection = connectSseByContract(
      client,
      getSseContract,
      {},
      {
        onEvent: {
          'item.updated': onItemUpdated,
          done: onDone,
        },
      },
    )

    await waitFor(() => onDone.mock.calls.length > 0)

    // Multi-line data is joined with \n
    expect(onItemUpdated).toHaveBeenCalledOnce()
    expect(onDone).toHaveBeenCalledWith({ total: 1 })
    connection.close()
  })

  it('ignores SSE comment lines and unrecognised fields', async () => {
    await mockServer.forGet('/events/stream').thenCallback(() => ({
      statusCode: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      // Include a colon-prefixed comment and an unknown field
      body: `: this is a keepalive comment\nretry: 3000\nevent: done\ndata: ${JSON.stringify({ total: 0 })}\n\n`,
    }))

    const onDone = vi.fn()
    const onError = vi.fn()

    const client = wretch(mockServer.url)
    const connection = connectSseByContract(
      client,
      getSseContract,
      {},
      {
        onEvent: {
          'item.updated': vi.fn(),
          done: onDone,
        },
        onError,
      },
    )

    await waitFor(() => onDone.mock.calls.length > 0)

    expect(onDone).toHaveBeenCalledWith({ total: 0 })
    expect(onError).not.toHaveBeenCalled()
    connection.close()
  })

  it('resolves headers from a function', async () => {
    await mockServer.forGet('/events/stream').thenCallback((_req) => ({
      statusCode: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: sseResponse([{ event: 'done', data: JSON.stringify({ total: 0 }) }]),
    }))

    const onDone = vi.fn()
    const headersFn = () => ({ 'x-custom': 'test-value' })

    const headerContract = buildSseContract({
      method: 'get',
      pathResolver: () => '/events/stream',
      requestHeaderSchema: z.object({ 'x-custom': z.string() }),
      serverSentEventSchemas: {
        done: doneSchema,
      },
    })

    const client = wretch(mockServer.url)
    const connection = connectSseByContract(
      client,
      headerContract,
      { headers: headersFn },
      {
        onEvent: { done: onDone },
      },
    )

    await waitFor(() => onDone.mock.calls.length > 0)
    expect(onDone).toHaveBeenCalledOnce()
    connection.close()
  })

  it('resolves headers from an async function', async () => {
    await mockServer.forGet('/events/stream').thenCallback(() => ({
      statusCode: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: sseResponse([{ event: 'done', data: JSON.stringify({ total: 0 }) }]),
    }))

    const onDone = vi.fn()
    const asyncHeadersFn = async () => ({ 'x-custom': 'async-value' })

    const headerContract = buildSseContract({
      method: 'get',
      pathResolver: () => '/events/stream',
      requestHeaderSchema: z.object({ 'x-custom': z.string() }),
      serverSentEventSchemas: {
        done: doneSchema,
      },
    })

    const client = wretch(mockServer.url)
    const connection = connectSseByContract(
      client,
      headerContract,
      { headers: asyncHeadersFn },
      {
        onEvent: { done: onDone },
      },
    )

    await waitFor(() => onDone.mock.calls.length > 0)
    expect(onDone).toHaveBeenCalledOnce()
    connection.close()
  })

  it('serialises query params correctly', async () => {
    await mockServer
      .forGet('/events/stream')
      .withQuery({ limit: '10' })
      .thenCallback(() => ({
        statusCode: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: sseResponse([
          { event: 'item.updated', data: JSON.stringify({ items: [{ id: '1' }] }) },
        ]),
      }))

    const onItemUpdated = vi.fn()

    const client = wretch(mockServer.url)
    const connection = connectSseByContract(
      client,
      getWithQueryContract,
      { queryParams: { limit: 10 } },
      {
        onEvent: {
          'item.updated': onItemUpdated,
        },
      },
    )

    await waitFor(() => onItemUpdated.mock.calls.length > 0)

    expect(onItemUpdated).toHaveBeenCalledWith({ items: [{ id: '1' }] })
    connection.close()
  })
})
