import { Readable } from 'node:stream'
import {
  blobResponse,
  defineApiContract,
  noBodyResponse,
  sseResponse,
} from '@lokalise/api-contracts'
import { getLocal, type Mockttp } from 'mockttp'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import wretch from 'wretch'
import { z } from 'zod/v4'
import { createFallbackTransport } from './createFallbackTransport.ts'
import {
  FallbackEventValidationError,
  FallbackSnapshotValidationError,
  FallbackTransportError,
  FallbackUnexpectedSnapshotError,
} from './errors.ts'
import type { FallbackParsedSseFrame, FallbackTransportRequest } from './types.ts'

const snapshotSchema = z.object({ version: z.number(), status: z.string() })
const uploadFinishedSchema = z.object({ version: z.number(), result: z.string() })

const eventSchemas = {
  uploadFinished: uploadFinishedSchema,
  progress: z.object({ version: z.number(), percent: z.number() }),
}

const dualModeContract = defineApiContract({
  visibility: 'public',
  summary: 'Upload status',
  method: 'get',
  pathResolver: () => '/uploads/u-1/status',
  responsesByStatusCode: {
    200: {
      content: {
        'application/json': snapshotSchema,
        ...sseResponse(eventSchemas).content,
      },
    },
    404: z.object({ message: z.string() }),
  },
})

const jsonOnlyContract = defineApiContract({
  visibility: 'public',
  summary: 'Upload snapshot',
  method: 'get',
  pathResolver: () => '/uploads/u-1/status',
  responsesByStatusCode: { 200: snapshotSchema },
})

const postContract = defineApiContract({
  visibility: 'public',
  summary: 'Search uploads',
  method: 'post',
  pathResolver: () => '/uploads/search',
  requestBodySchema: z.object({ query: z.string() }),
  responsesByStatusCode: {
    200: {
      content: {
        'application/json': snapshotSchema,
        ...sseResponse(eventSchemas).content,
      },
    },
  },
})

const blobContract = defineApiContract({
  visibility: 'public',
  summary: 'Upload archive',
  method: 'get',
  pathResolver: () => '/uploads/u-1/status',
  responsesByStatusCode: { 200: blobResponse('application/octet-stream') },
})

const noBodyContract = defineApiContract({
  visibility: 'public',
  summary: 'Upload ack',
  method: 'get',
  pathResolver: () => '/uploads/u-1/status',
  responsesByStatusCode: { 204: noBodyResponse() },
})

const JSON_HEADERS = { 'content-type': 'application/json' }
const SSE_HEADERS = { 'content-type': 'text/event-stream' }

const getRequest: FallbackTransportRequest = {
  path: '/uploads/u-1/status',
  method: 'get',
}

function frameOf(event: string, data: unknown, id?: string): string {
  return `${id === undefined ? '' : `id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

async function collectChunks(chunks: AsyncIterable<string>): Promise<string[]> {
  const collected: string[] = []
  for await (const chunk of chunks) collected.push(chunk)
  return collected
}

async function collectFrames(
  frames: AsyncIterable<FallbackParsedSseFrame>,
): Promise<FallbackParsedSseFrame[]> {
  const collected: FallbackParsedSseFrame[] = []
  for await (const frame of frames) collected.push(frame)
  return collected
}

/** A response body we control frame by frame, so a stream can be left open. */
function openBody() {
  const body = new Readable({ read() {} })
  return {
    body,
    write: (text: string) => body.push(text),
    end: () => body.push(null),
  }
}

describe('createFallbackTransport', () => {
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

  function transportFor(options: Parameters<typeof createFallbackTransport>[1] = {}) {
    return createFallbackTransport(wretch(mockServer.url), options)
  }

  const signalOf = (controller = new AbortController()) => ({ signal: controller.signal })

  describe('configuration', () => {
    it("refuses eventValidation 'drop' without streamMode 'events'", () => {
      expect(() =>
        transportFor({ contract: dualModeContract, eventValidation: 'drop' }),
      ).toThrowError(/eventValidation 'drop' requires streamMode 'events'/)
    })

    it('refuses validation against a contract that declares no SSE events', () => {
      expect(() =>
        transportFor({ contract: jsonOnlyContract, eventValidation: 'report' }),
      ).toThrowError(/declares no SSE event schemas/)
    })

    it('refuses validation with no contract to validate against', () => {
      expect(() => transportFor({ eventValidation: 'report' })).toThrowError(
        /no contract was supplied to validate against/,
      )
    })

    it('rejects a method the client cannot send', async () => {
      const transport = transportFor({ contract: dualModeContract })

      await expect(
        transport.fetchSnapshot({ path: '/uploads/u-1/status', method: 'trace' }, signalOf()),
      ).rejects.toThrowError(/"trace" is not a supported HTTP method/)
    })
  })

  describe('fetchSnapshot', () => {
    it('asks for the JSON branch and validates the snapshot', async () => {
      const endpoint = await mockServer
        .forGet('/uploads/u-1/status')
        .thenJson(200, { version: 3, status: 'pending' })

      const transport = transportFor({ contract: dualModeContract })
      const snapshot = await transport.fetchSnapshot(getRequest, signalOf())

      expect(snapshot.status).toBe(200)
      expect(snapshot.body).toEqual({ version: 3, status: 'pending' })
      expect(snapshot.headers['content-type']).toContain('application/json')

      const [request] = await endpoint.getSeenRequests()
      expect(request?.headers.accept).toBe('application/json')
      // A cached poll would keep "succeeding" while reporting stale state,
      // which is exactly the silent failure the fallback exists to catch.
      expect(request?.headers['cache-control']).toBe('no-cache')
    })

    it('applies the path prefix and the query string', async () => {
      const endpoint = await mockServer
        .forGet('/api/v2/uploads/u-1/status')
        .thenJson(200, { version: 1, status: 'pending' })

      const transport = transportFor({ contract: dualModeContract, pathPrefix: '/api/v2' })
      await transport.fetchSnapshot({ ...getRequest, query: { verbose: 'true' } }, signalOf())

      const [request] = await endpoint.getSeenRequests()
      expect(request?.url).toContain('/api/v2/uploads/u-1/status?verbose=true')
    })

    it('honours a vendored JSON media type', async () => {
      const vendoredContract = defineApiContract({
        visibility: 'public',
        summary: 'Vendored snapshot',
        method: 'get',
        pathResolver: () => '/uploads/u-1/status',
        responsesByStatusCode: {
          200: { content: { 'application/json+01': snapshotSchema } },
        },
      })
      const endpoint = await mockServer
        .forGet('/uploads/u-1/status')
        .thenReply(200, JSON.stringify({ version: 1, status: 'pending' }), {
          'content-type': 'application/json+01',
        })

      const transport = transportFor({
        contract: vendoredContract,
        snapshotAccept: 'application/json+01',
      })
      const snapshot = await transport.fetchSnapshot(getRequest, signalOf())

      expect(snapshot.body).toEqual({ version: 1, status: 'pending' })
      const [request] = await endpoint.getSeenRequests()
      expect(request?.headers.accept).toBe('application/json+01')
    })

    it('resolves the header source for every request, so a refreshed token is used', async () => {
      const endpoint = await mockServer
        .forGet('/uploads/u-1/status')
        .thenJson(200, { version: 1, status: 'pending' })

      let token = 'first'
      const transport = transportFor({
        contract: dualModeContract,
        headers: () => ({ authorization: `Bearer ${token}` }),
      })

      await transport.fetchSnapshot(getRequest, signalOf())
      token = 'refreshed'
      await transport.fetchSnapshot(getRequest, signalOf())

      const requests = await endpoint.getSeenRequests()
      expect(requests.map((request) => request.headers.authorization)).toEqual([
        'Bearer first',
        'Bearer refreshed',
      ])
    })

    it('accepts an async header source and a static header map', async () => {
      const endpoint = await mockServer
        .forGet('/uploads/u-1/status')
        .thenJson(200, { version: 1, status: 'pending' })

      await transportFor({
        contract: dualModeContract,
        headers: () => Promise.resolve({ 'x-async': 'yes' }),
      }).fetchSnapshot(getRequest, signalOf())
      await transportFor({
        contract: dualModeContract,
        headers: { 'x-static': 'yes' },
      }).fetchSnapshot(getRequest, signalOf())

      const requests = await endpoint.getSeenRequests()
      expect(requests[0]?.headers['x-async']).toBe('yes')
      expect(requests[1]?.headers['x-static']).toBe('yes')
    })

    it('lets request headers through but keeps ownership of Accept', async () => {
      const endpoint = await mockServer
        .forGet('/uploads/u-1/status')
        .thenJson(200, { version: 1, status: 'pending' })

      await transportFor({ contract: dualModeContract }).fetchSnapshot(
        { ...getRequest, headers: { 'x-tenant': 'acme', accept: 'text/event-stream' } },
        signalOf(),
      )

      const [request] = await endpoint.getSeenRequests()
      expect(request?.headers['x-tenant']).toBe('acme')
      // Letting a request-level Accept win would send the poll to the stream
      // branch and leave the fallback with no snapshot at all.
      expect(request?.headers.accept).toBe('application/json')
    })

    it('sends a JSON body for a payload contract', async () => {
      const endpoint = await mockServer
        .forPost('/uploads/search')
        .thenJson(200, { version: 1, status: 'pending' })

      await transportFor({ contract: postContract }).fetchSnapshot(
        { path: '/uploads/search', method: 'post', body: { query: 'invoice' } },
        signalOf(),
      )

      const [request] = await endpoint.getSeenRequests()
      expect(await request?.body.getJson()).toEqual({ query: 'invoice' })
      expect(request?.headers['content-type']).toBe('application/json')
    })

    it('ignores a body on a method that cannot carry one', async () => {
      const endpoint = await mockServer
        .forGet('/uploads/u-1/status')
        .thenJson(200, { version: 1, status: 'pending' })

      await transportFor({ contract: dualModeContract }).fetchSnapshot(
        { ...getRequest, body: { ignored: true } },
        signalOf(),
      )

      const [request] = await endpoint.getSeenRequests()
      expect(await request?.body.getText()).toBe('')
    })

    it('reports every poll to diagnostics, refusals included', async () => {
      await mockServer.forGet('/uploads/u-1/status').thenJson(404, { message: 'gone' })

      const onSnapshot = vi.fn()
      const snapshot = await transportFor({
        contract: dualModeContract,
        diagnostics: { onSnapshot },
      }).fetchSnapshot(getRequest, signalOf())

      expect(snapshot).toEqual({
        status: 404,
        headers: expect.objectContaining({ 'content-type': expect.stringContaining('json') }),
        body: { message: 'gone' },
      })
      expect(onSnapshot).toHaveBeenCalledWith({
        path: '/uploads/u-1/status',
        status: 404,
        durationMs: expect.any(Number),
      })
    })

    it('resolves a refusal that carried a plain-text body', async () => {
      await mockServer.forGet('/uploads/u-1/status').thenReply(503, 'upstream unavailable')

      const snapshot = await transportFor({ contract: dualModeContract }).fetchSnapshot(
        getRequest,
        signalOf(),
      )

      // The core, not the transport, decides what a status means — so a refusal
      // is a resolved snapshot response rather than a rejection.
      expect(snapshot.status).toBe(503)
      expect(snapshot.body).toBe('upstream unavailable')
    })

    it('rejects a snapshot that violates the contract schema', async () => {
      await mockServer.forGet('/uploads/u-1/status').thenJson(200, { version: 'three' })

      let caught: unknown
      try {
        await transportFor({ contract: dualModeContract }).fetchSnapshot(getRequest, signalOf())
      } catch (error) {
        caught = error
      }

      expect(caught).toBeInstanceOf(FallbackSnapshotValidationError)
      const error = caught as FallbackSnapshotValidationError
      expect(error.channel).toBe('poll')
      expect(error.path).toBe('/uploads/u-1/status')
      expect(error.status).toBe(200)
      expect(error.issues.length).toBeGreaterThan(0)
      expect(error.message).toContain('does not match the schema of "Upload status"')
    })

    it('passes the body through unvalidated when asked to', async () => {
      await mockServer.forGet('/uploads/u-1/status').thenJson(200, { version: 'three' })

      const snapshot = await transportFor({
        contract: dualModeContract,
        validateSnapshot: false,
      }).fetchSnapshot(getRequest, signalOf())

      expect(snapshot.body).toEqual({ version: 'three' })
    })

    it('works without a contract, parsing the body as JSON', async () => {
      await mockServer.forGet('/uploads/u-1/status').thenJson(200, { anything: true })

      const snapshot = await transportFor().fetchSnapshot(getRequest, signalOf())

      expect(snapshot.body).toEqual({ anything: true })
    })

    it('rejects a body that is not JSON, with a preview of what arrived', async () => {
      await mockServer
        .forGet('/uploads/u-1/status')
        .thenReply(200, '<html>login</html>', JSON_HEADERS)

      let caught: unknown
      try {
        await transportFor({ contract: dualModeContract }).fetchSnapshot(getRequest, signalOf())
      } catch (error) {
        caught = error
      }

      expect(caught).toBeInstanceOf(FallbackUnexpectedSnapshotError)
      expect((caught as FallbackUnexpectedSnapshotError).bodyPreview).toBe('<html>login</html>')
    })

    it('truncates a long body preview', async () => {
      await mockServer.forGet('/uploads/u-1/status').thenReply(200, 'x'.repeat(500), JSON_HEADERS)

      const caught = await transportFor({ contract: dualModeContract })
        .fetchSnapshot(getRequest, signalOf())
        .catch((error: unknown) => error)

      expect((caught as FallbackUnexpectedSnapshotError).bodyPreview).toBe(`${'x'.repeat(200)}…`)
    })

    it('rejects an empty snapshot body', async () => {
      await mockServer.forGet('/uploads/u-1/status').thenReply(200, '', JSON_HEADERS)

      await expect(
        transportFor({ contract: dualModeContract }).fetchSnapshot(getRequest, signalOf()),
      ).rejects.toThrowError(/returned an empty body where a JSON snapshot was expected/)
    })

    it('rejects a content type the contract does not declare for that status', async () => {
      await mockServer
        .forGet('/uploads/u-1/status')
        .thenReply(200, 'plain', { 'content-type': 'text/plain' })

      await expect(
        transportFor({ contract: dualModeContract }).fetchSnapshot(getRequest, signalOf()),
      ).rejects.toThrowError(/does not declare for that status/)
    })

    it('falls back to the sole declared representation when strictness is off', async () => {
      await mockServer
        .forGet('/uploads/u-1/status')
        .thenReply(200, JSON.stringify({ version: 1, status: 'pending' }), {
          'content-type': 'text/plain',
        })

      const snapshot = await transportFor({
        contract: jsonOnlyContract,
        strictContentType: false,
      }).fetchSnapshot(getRequest, signalOf())

      expect(snapshot.body).toEqual({ version: 1, status: 'pending' })
    })

    it('rejects an SSE stream on the poll branch, naming the negotiation', async () => {
      await mockServer
        .forGet('/uploads/u-1/status')
        .thenReply(200, frameOf('progress', { version: 1, percent: 10 }), SSE_HEADERS)

      await expect(
        transportFor({ contract: dualModeContract }).fetchSnapshot(getRequest, signalOf()),
      ).rejects.toThrowError(/answered with an SSE stream instead of a snapshot/)
    })

    it('rejects a binary snapshot', async () => {
      await mockServer
        .forGet('/uploads/u-1/status')
        .thenReply(200, 'binary', { 'content-type': 'application/octet-stream' })

      await expect(
        transportFor({ contract: blobContract }).fetchSnapshot(getRequest, signalOf()),
      ).rejects.toThrowError(/resolved to a binary response, which cannot be a snapshot/)
    })

    it('rejects a bodyless snapshot response', async () => {
      await mockServer.forGet('/uploads/u-1/status').thenReply(204)

      await expect(
        transportFor({ contract: noBodyContract }).fetchSnapshot(getRequest, signalOf()),
      ).rejects.toThrowError(/returned status 204 with no body/)
    })

    it('rejects a network failure with the channel and path attached', async () => {
      await mockServer.forGet('/uploads/u-1/status').thenCloseConnection()

      let caught: unknown
      try {
        await transportFor({ contract: dualModeContract }).fetchSnapshot(getRequest, signalOf())
      } catch (error) {
        caught = error
      }

      expect(caught).toBeInstanceOf(FallbackTransportError)
      expect((caught as FallbackTransportError).channel).toBe('poll')
      expect((caught as FallbackTransportError).path).toBe('/uploads/u-1/status')
      expect((caught as FallbackTransportError).message).toContain('The poll request to')
    })

    it('rejects once the core aborts the poll', async () => {
      await mockServer.forGet('/uploads/u-1/status').thenTimeout()

      const controller = new AbortController()
      const pending = transportFor({ contract: dualModeContract }).fetchSnapshot(
        getRequest,
        signalOf(controller),
      )
      controller.abort()

      // `pollTimeoutMs` is enforced by the core through this signal; the
      // transport imposes no deadline of its own.
      await expect(pending).rejects.toThrowError(FallbackTransportError)
    })
  })

  describe('openStream', () => {
    it('asks for the SSE branch and yields raw text, heartbeats included', async () => {
      const endpoint = await mockServer
        .forGet('/uploads/u-1/status')
        .thenReply(
          200,
          `: heartbeat\n\n${frameOf('progress', { version: 1, percent: 50 }, '1')}`,
          SSE_HEADERS,
        )

      const stream = await transportFor({ contract: dualModeContract }).openStream(
        getRequest,
        signalOf(),
      )

      expect(stream.status).toBe(200)
      expect(stream.headers['content-type']).toContain('text/event-stream')
      expect('chunks' in stream).toBe(true)
      const text = (await collectChunks((stream as { chunks: AsyncIterable<string> }).chunks)).join(
        '',
      )
      // Comment frames must survive: they are what makes the core's
      // stale-connection watchdog byte-level rather than event-level.
      expect(text).toContain(': heartbeat')
      expect(text).toContain('event: progress')

      const [request] = await endpoint.getSeenRequests()
      expect(request?.headers.accept).toBe('text/event-stream')
      expect(request?.headers['cache-control']).toBe('no-cache')
      expect(request?.headers['last-event-id']).toBeUndefined()
    })

    it('forwards the reconnect cursor as Last-Event-ID', async () => {
      const endpoint = await mockServer
        .forGet('/uploads/u-1/status')
        .thenReply(200, '', SSE_HEADERS)

      const transport = transportFor({ contract: dualModeContract })
      await transport.openStream(getRequest, { ...signalOf(), lastEventId: '1757-000042' })
      // An empty cursor is "no cursor": sending it would ask a spec-following
      // server to replay the whole stream.
      await transport.openStream(getRequest, { ...signalOf(), lastEventId: '' })

      const requests = await endpoint.getSeenRequests()
      expect(requests[0]?.headers['last-event-id']).toBe('1757-000042')
      expect(requests[1]?.headers['last-event-id']).toBeUndefined()
    })

    it('resolves a refused connect with its status and no stream', async () => {
      await mockServer.forGet('/uploads/u-1/status').thenJson(401, { message: 'expired' })

      const onStreamOpen = vi.fn()
      const stream = await transportFor({
        contract: dualModeContract,
        diagnostics: { onStreamOpen },
      }).openStream(getRequest, { ...signalOf(), lastEventId: '7' })

      // The core needs the status to honour `unretryableStatuses` and to offer
      // the refusal to `onAuthChallenge`.
      expect(stream.status).toBe(401)
      expect(await collectChunks((stream as { chunks: AsyncIterable<string> }).chunks)).toEqual([])
      expect(onStreamOpen).toHaveBeenCalledWith({
        path: '/uploads/u-1/status',
        status: 401,
        contentType: expect.stringContaining('json'),
        lastEventId: '7',
      })
    })

    it('leaves a wrong content type for the core to judge', async () => {
      await mockServer
        .forGet('/uploads/u-1/status')
        .thenJson(200, { version: 1, status: 'pending' })

      const stream = await transportFor({ contract: dualModeContract }).openStream(
        getRequest,
        signalOf(),
      )

      // The core treats a non-`text/event-stream` 200 as a connect failure and
      // degrades; second-guessing it here would hide the status from it.
      expect(stream.status).toBe(200)
      expect(stream.headers['content-type']).toContain('application/json')
    })

    it('ends iteration quietly when the core aborts the stream', async () => {
      const upstream = openBody()
      await mockServer.forGet('/uploads/u-1/status').thenStream(200, upstream.body, SSE_HEADERS)
      upstream.write(frameOf('progress', { version: 1, percent: 10 }, '1'))

      const controller = new AbortController()
      const stream = await transportFor({ contract: dualModeContract }).openStream(
        getRequest,
        signalOf(controller),
      )

      const chunks: string[] = []
      const drained = (async () => {
        for await (const chunk of (stream as { chunks: AsyncIterable<string> }).chunks) {
          chunks.push(chunk)
        }
      })()

      await vi.waitFor(() => expect(chunks.length).toBeGreaterThan(0))
      // The core aborts to force a reconnect (stale watchdog) and to release
      // the socket on stop; neither is a stream error worth reporting.
      controller.abort()
      await expect(drained).resolves.toBeUndefined()
      upstream.end()
    })

    it('throws when the connection dies mid-stream', async () => {
      // A body that errors after its first chunk is not something a mock HTTP
      // server can express, so the failure is injected at the fetch seam.
      const dyingFetch = () =>
        Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new TextEncoder().encode(frameOf('progress', { version: 1 })))
                controller.error(new Error('upstream went away'))
              },
            }),
            { status: 200, headers: SSE_HEADERS },
          ),
        )

      const stream = await createFallbackTransport(
        wretch(mockServer.url).polyfills({ fetch: dyingFetch }),
        { contract: dualModeContract },
      ).openStream(getRequest, signalOf())

      // A dead connection has to surface: the core counts it, backs off, and
      // polls to repair whatever the stream did not deliver.
      await expect(
        collectChunks((stream as { chunks: AsyncIterable<string> }).chunks),
      ).rejects.toThrowError('upstream went away')
    })

    it('does not emit a chunk for a split multi-byte character', async () => {
      const upstream = openBody()
      await mockServer.forGet('/uploads/u-1/status').thenStream(200, upstream.body, SSE_HEADERS)

      const stream = await transportFor({ contract: dualModeContract }).openStream(
        getRequest,
        signalOf(),
      )
      const drained = collectChunks((stream as { chunks: AsyncIterable<string> }).chunks)

      // Write the leading byte of the three-byte "…" on its own, so one chunk
      // decodes to nothing at all.
      const bytes = Buffer.from('data: …\n\n', 'utf8')
      upstream.body.push(bytes.subarray(0, 6))
      await new Promise((resolve) => setTimeout(resolve, 20))
      upstream.body.push(bytes.subarray(6, 7))
      await new Promise((resolve) => setTimeout(resolve, 20))
      upstream.body.push(bytes.subarray(7))
      upstream.end()

      const chunks = await drained
      expect(chunks.every((chunk) => chunk !== '')).toBe(true)
      expect(chunks.join('')).toBe('data: …\n\n')
    })
  })

  describe('event validation', () => {
    it('reports a payload that does not match the contract, without withholding it', async () => {
      await mockServer
        .forGet('/uploads/u-1/status')
        .thenReply(200, frameOf('uploadFinished', { version: 1, result: 42 }, '1'), SSE_HEADERS)

      const onEventSchemaError = vi.fn()
      const stream = await transportFor({
        contract: dualModeContract,
        diagnostics: { onEventSchemaError },
      }).openStream(getRequest, signalOf())
      const text = (await collectChunks((stream as { chunks: AsyncIterable<string> }).chunks)).join(
        '',
      )

      // Raw chunks are framed by the core, so its version gate has already
      // moved by the time app code sees the event: withholding it here would
      // leave a hole the repair poll reads as a duplicate and drops.
      expect(text).toContain('uploadFinished')
      expect(onEventSchemaError).toHaveBeenCalledTimes(1)
      const error = onEventSchemaError.mock.calls[0]?.[0] as FallbackEventValidationError
      expect(error).toBeInstanceOf(FallbackEventValidationError)
      expect(error.event).toBe('uploadFinished')
      expect(error.issues).toHaveLength(1)
      expect(error.message).toContain('does not match its schema')
    })

    it('reports a payload that is not JSON at all', async () => {
      await mockServer
        .forGet('/uploads/u-1/status')
        .thenReply(200, 'event: uploadFinished\ndata: not-json\n\n', SSE_HEADERS)

      const onEventSchemaError = vi.fn()
      const stream = await transportFor({
        contract: dualModeContract,
        diagnostics: { onEventSchemaError },
      }).openStream(getRequest, signalOf())
      await collectChunks((stream as { chunks: AsyncIterable<string> }).chunks)

      const error = onEventSchemaError.mock.calls[0]?.[0] as FallbackEventValidationError
      expect(error.message).toContain('is not valid JSON')
      expect(error.data).toBe('not-json')
    })

    it('reports an event the contract does not declare, but never drops it', async () => {
      await mockServer
        .forGet('/uploads/u-1/status')
        .thenReply(200, frameOf('uploadRenamed', { version: 9 }, '1'), SSE_HEADERS)

      const onUndeclaredEvent = vi.fn()
      const onEventSchemaError = vi.fn()
      const stream = await transportFor({
        contract: dualModeContract,
        streamMode: 'events',
        eventValidation: 'drop',
        diagnostics: { onUndeclaredEvent, onEventSchemaError },
      }).openStream(getRequest, signalOf())

      const frames = await collectFrames(
        (stream as { events: AsyncIterable<FallbackParsedSseFrame> }).events,
      )
      // An undeclared event usually means a newer server, not a broken one.
      expect(frames).toHaveLength(1)
      expect(onUndeclaredEvent).toHaveBeenCalledWith({
        path: '/uploads/u-1/status',
        event: 'uploadRenamed',
      })
      expect(onEventSchemaError).not.toHaveBeenCalled()
    })

    it('stays silent when validation is off', async () => {
      await mockServer
        .forGet('/uploads/u-1/status')
        .thenReply(200, frameOf('uploadFinished', { version: 1, result: 42 }), SSE_HEADERS)

      const onEventSchemaError = vi.fn()
      const stream = await transportFor({
        contract: dualModeContract,
        eventValidation: 'off',
        diagnostics: { onEventSchemaError },
      }).openStream(getRequest, signalOf())
      await collectChunks((stream as { chunks: AsyncIterable<string> }).chunks)

      expect(onEventSchemaError).not.toHaveBeenCalled()
    })

    it('frames without validating when validation is off in events mode', async () => {
      await mockServer
        .forGet('/uploads/u-1/status')
        .thenReply(200, frameOf('uploadFinished', { version: 1, result: 42 }), SSE_HEADERS)

      const onEventSchemaError = vi.fn()
      const stream = await transportFor({
        contract: dualModeContract,
        streamMode: 'events',
        eventValidation: 'off',
        diagnostics: { onEventSchemaError },
      }).openStream(getRequest, signalOf())

      const frames = await collectFrames(
        (stream as { events: AsyncIterable<FallbackParsedSseFrame> }).events,
      )
      expect(frames).toHaveLength(1)
      expect(onEventSchemaError).not.toHaveBeenCalled()
    })

    it('frames the stream itself in events mode, keeping per-frame ids', async () => {
      await mockServer
        .forGet('/uploads/u-1/status')
        .thenReply(
          200,
          `: heartbeat\n\n${frameOf('progress', { version: 1, percent: 10 }, '1')}${frameOf(
            'progress',
            { version: 2, percent: 20 },
          )}`,
          SSE_HEADERS,
        )

      const stream = await transportFor({
        contract: dualModeContract,
        streamMode: 'events',
      }).openStream(getRequest, signalOf())

      const frames = await collectFrames(
        (stream as { events: AsyncIterable<FallbackParsedSseFrame> }).events,
      )
      expect(frames).toEqual([
        {
          event: 'progress',
          data: JSON.stringify({ version: 1, percent: 10 }),
          id: '1',
          lastEventId: '1',
        },
        // The second frame carries no id of its own — the sticky cursor is
        // reported separately so the core's version gate does not read it as a
        // repeat of version 1.
        {
          event: 'progress',
          data: JSON.stringify({ version: 2, percent: 20 }),
          lastEventId: '1',
        },
      ])
    })

    it('withholds an invalid frame in drop mode so a poll repairs the gap', async () => {
      await mockServer
        .forGet('/uploads/u-1/status')
        .thenReply(
          200,
          `${frameOf('uploadFinished', { version: 1, result: 42 }, '1')}${frameOf(
            'progress',
            { version: 2, percent: 20 },
            '2',
          )}`,
          SSE_HEADERS,
        )

      const onEventSchemaError = vi.fn()
      const stream = await transportFor({
        contract: dualModeContract,
        streamMode: 'events',
        eventValidation: 'drop',
        diagnostics: { onEventSchemaError },
      }).openStream(getRequest, signalOf())

      const frames = await collectFrames(
        (stream as { events: AsyncIterable<FallbackParsedSseFrame> }).events,
      )
      expect(frames.map((frame) => frame.event)).toEqual(['progress'])
      expect(onEventSchemaError).toHaveBeenCalledTimes(1)
    })
  })

  describe('responses a mock server cannot produce', () => {
    const respondWith = (body: BodyInit | null, init?: ResponseInit) =>
      createFallbackTransport(
        wretch(mockServer.url).polyfills({
          fetch: () => Promise.resolve(new Response(body, init)),
        }),
        { contract: dualModeContract },
      )

    /** A stream body keeps fetch from inferring a content type for us. */
    const streamOf = (text: string) =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(text))
          controller.close()
        },
      })

    it('names a missing content type in the rejection', async () => {
      const caught = await respondWith(streamOf('{"version":1,"status":"ok"}'), { status: 200 })
        .fetchSnapshot(getRequest, signalOf())
        .catch((error: unknown) => error)

      expect(caught).toBeInstanceOf(FallbackUnexpectedSnapshotError)
      expect((caught as FallbackUnexpectedSnapshotError).message).toContain(
        'with content-type "<none>"',
      )
    })

    it('describes a rejection that was not thrown as an Error', async () => {
      const caught = await createFallbackTransport(
        wretch(mockServer.url).polyfills({ fetch: () => Promise.reject('socket hang up') }),
        { contract: dualModeContract },
      )
        .fetchSnapshot(getRequest, signalOf())
        .catch((error: unknown) => error)

      expect(caught).toBeInstanceOf(FallbackTransportError)
      expect((caught as FallbackTransportError).message).toContain('socket hang up')
    })
  })

  describe('stream state a frame could not carry (events mode)', () => {
    /** Open a framed stream, drain it, and report the request it sent. */
    async function drain(
      transport: ReturnType<typeof createFallbackTransport>,
      lastEventId?: string,
    ): Promise<void> {
      const stream = await transport.openStream(
        getRequest,
        lastEventId === undefined ? signalOf() : { ...signalOf(), lastEventId },
      )
      await collectFrames((stream as { events: AsyncIterable<FallbackParsedSseFrame> }).events)
    }

    // In `chunks` mode the core's own parser reads `id:` and `retry:` per
    // chunk whether or not they dispatch an event. Framing here is what takes
    // that away, so the residue has to survive to the next connect.
    it('resumes from an id the last connection framed but no frame reported', async () => {
      const endpoint = await mockServer
        .forGet('/uploads/u-1/status')
        .thenReply(
          200,
          `${frameOf('progress', { version: 1, percent: 10 }, 'e-1')}id: e-2\n\n`,
          SSE_HEADERS,
        )

      const transport = transportFor({ contract: dualModeContract, streamMode: 'events' })
      await drain(transport)
      // The core saw one frame, so its cursor is that frame's id.
      await drain(transport, 'e-1')

      const requests = await endpoint.getSeenRequests()
      expect(requests[1]?.headers['last-event-id']).toBe('e-2')
    })

    it('stamps a retry hint the last connection never got to deliver', async () => {
      await mockServer
        .forGet('/uploads/u-1/status')
        .once()
        .thenReply(200, 'retry: 9000\n\n', SSE_HEADERS)
      await mockServer
        .forGet('/uploads/u-1/status')
        .thenReply(200, frameOf('progress', { version: 1, percent: 10 }, 'e-1'), SSE_HEADERS)

      const transport = transportFor({ contract: dualModeContract, streamMode: 'events' })
      await drain(transport)

      const stream = await transport.openStream(getRequest, signalOf())
      const frames = await collectFrames(
        (stream as { events: AsyncIterable<FallbackParsedSseFrame> }).events,
      )
      expect(frames[0]?.retry).toBe(9000)
    })

    it('does not resume past a frame the core never received', async () => {
      const endpoint = await mockServer
        .forGet('/uploads/u-1/status')
        .thenReply(
          200,
          `${frameOf('progress', { version: 1, percent: 10 }, 'e-1')}${frameOf(
            'uploadFinished',
            { version: 2, result: 42 },
            'e-2',
          )}`,
          SSE_HEADERS,
        )

      const transport = transportFor({
        contract: dualModeContract,
        streamMode: 'events',
        eventValidation: 'drop',
      })
      await drain(transport)
      await drain(transport, 'e-1')

      // `e-2` was withheld, so replaying from it would skip it for good — the
      // repair the drop counts on is exactly a re-delivery.
      const requests = await endpoint.getSeenRequests()
      expect(requests[1]?.headers['last-event-id']).toBe('e-1')
    })

    it('defers to a cursor the core moved on its own', async () => {
      const endpoint = await mockServer
        .forGet('/uploads/u-1/status')
        .thenReply(
          200,
          `${frameOf('progress', { version: 1, percent: 10 }, 'e-1')}${frameOf(
            'progress',
            { version: 2, percent: 20 },
            'e-2',
          )}`,
          SSE_HEADERS,
        )

      const transport = transportFor({ contract: dualModeContract, streamMode: 'events' })
      await drain(transport)
      // The core is behind the last frame it was handed, so it held the cursor
      // back on purpose — a frame it could not read. Overriding that would make
      // the replay skip that frame for good.
      await drain(transport, 'e-1')

      const requests = await endpoint.getSeenRequests()
      expect(requests[1]?.headers['last-event-id']).toBe('e-1')
    })

    it('does not hand one stream the residue of another', async () => {
      await mockServer.forGet('/uploads/u-1/status').thenReply(200, 'id: e-2\n\n', SSE_HEADERS)
      const other = await mockServer.forGet('/uploads/u-2/status').thenReply(200, '', SSE_HEADERS)

      const transport = transportFor({ contract: dualModeContract, streamMode: 'events' })
      await drain(transport)

      const stream = await transport.openStream(
        { path: '/uploads/u-2/status', method: 'get' },
        { ...signalOf(), lastEventId: 'other-1' },
      )
      await collectFrames((stream as { events: AsyncIterable<FallbackParsedSseFrame> }).events)

      const requests = await other.getSeenRequests()
      expect(requests[0]?.headers['last-event-id']).toBe('other-1')
    })
  })

  describe('releasing a body it walks away from', () => {
    /** A body that never ends, and tells us whether it was released. */
    function endlessBody(text: string) {
      let released = false
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(text))
        },
        cancel() {
          released = true
        },
      })
      return { stream, wasReleased: () => released }
    }

    const transportRespondingWith = (
      body: BodyInit,
      init: ResponseInit,
      options: Parameters<typeof createFallbackTransport>[1],
    ) =>
      createFallbackTransport(
        wretch(mockServer.url).polyfills({
          fetch: () => Promise.resolve(new Response(body, init)),
        }),
        options,
      )

    // The core's `executePoll` aborts a poll on timeout or on stopping, never
    // one the transport rejected — so a body left unread here is a connection
    // held for the life of the page, once per failing poll.
    it('releases an SSE stream that reached the poll branch', async () => {
      const { stream, wasReleased } = endlessBody(': open\n\n')

      await expect(
        transportRespondingWith(
          stream,
          { status: 200, headers: SSE_HEADERS },
          { contract: dualModeContract },
        ).fetchSnapshot(getRequest, signalOf()),
      ).rejects.toThrowError(FallbackUnexpectedSnapshotError)

      expect(wasReleased()).toBe(true)
    })

    it('releases a binary body it cannot read as a snapshot', async () => {
      const { stream, wasReleased } = endlessBody('binary')

      await expect(
        transportRespondingWith(
          stream,
          { status: 200, headers: { 'content-type': 'application/octet-stream' } },
          { contract: blobContract },
        ).fetchSnapshot(getRequest, signalOf()),
      ).rejects.toThrowError(FallbackUnexpectedSnapshotError)

      expect(wasReleased()).toBe(true)
    })

    it('releases a body whose content type the contract does not declare', async () => {
      const { stream, wasReleased } = endlessBody('<html></html>')

      await expect(
        transportRespondingWith(
          stream,
          { status: 200, headers: { 'content-type': 'text/html' } },
          { contract: dualModeContract },
        ).fetchSnapshot(getRequest, signalOf()),
      ).rejects.toThrowError(FallbackUnexpectedSnapshotError)

      expect(wasReleased()).toBe(true)
    })
  })

  describe('separate poll and stream contracts', () => {
    it('validates each channel against its own contract', async () => {
      const streamContract = defineApiContract({
        visibility: 'public',
        summary: 'Upload events',
        method: 'get',
        pathResolver: () => '/uploads/u-1/events',
        responsesByStatusCode: { 200: sseResponse(eventSchemas) },
      })

      await mockServer.forGet('/uploads/u-1/status').thenJson(200, { version: 1, status: 'ok' })
      await mockServer
        .forGet('/uploads/u-1/events')
        .thenReply(200, frameOf('uploadFinished', { version: 1, result: 42 }), SSE_HEADERS)

      const onEventSchemaError = vi.fn()
      const transport = transportFor({
        snapshotContract: jsonOnlyContract,
        streamContract,
        diagnostics: { onEventSchemaError },
      })

      const snapshot = await transport.fetchSnapshot(getRequest, signalOf())
      expect(snapshot.body).toEqual({ version: 1, status: 'ok' })

      const stream = await transport.openStream(
        { path: '/uploads/u-1/events', method: 'get' },
        signalOf(),
      )
      await collectChunks((stream as { chunks: AsyncIterable<string> }).chunks)
      // A payload the *stream* contract rejects: proof the frames are checked
      // against `streamContract` and not against the poll's schema, which
      // knows nothing about events at all.
      expect(onEventSchemaError).toHaveBeenCalledTimes(1)
      expect(onEventSchemaError.mock.calls[0]?.[0]).toBeInstanceOf(FallbackEventValidationError)
      expect(onEventSchemaError.mock.calls[0]?.[0].event).toBe('uploadFinished')
    })
  })
})
