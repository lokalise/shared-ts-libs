import type { SseSchemaByEventName } from '@lokalise/api-contracts'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'
import type { SSECloseInitiator, SSEMessage, SSESession } from './sseTypes.ts'
import { buildApiSSEContext, determineResponseContentType } from './sseUtils.ts'

const requestWithAccept = (accept?: string): FastifyRequest =>
  ({ headers: accept === undefined ? {} : { accept } }) as FastifyRequest

describe('determineResponseContentType', () => {
  it('returns the candidate the Accept header names exactly', () => {
    const contentType = determineResponseContentType(requestWithAccept('application/json'), [
      'application/json',
      'text/event-stream',
    ])

    expect(contentType).toBe('application/json')
  })

  it('works for any media type, not just JSON/SSE', () => {
    const contentType = determineResponseContentType(requestWithAccept('text/csv'), [
      'application/json',
      'text/csv',
    ])

    expect(contentType).toBe('text/csv')
  })

  it('respects q= quality values when picking among candidates', () => {
    const contentType = determineResponseContentType(
      requestWithAccept('application/json;q=0.5, text/event-stream;q=0.9'),
      ['application/json', 'text/event-stream'],
    )

    expect(contentType).toBe('text/event-stream')
  })

  it('excludes media types rejected with q=0', () => {
    const contentType = determineResponseContentType(
      requestWithAccept('text/event-stream;q=0, application/json'),
      ['application/json', 'text/event-stream'],
    )

    expect(contentType).toBe('application/json')
  })

  it('resolves */* to the first candidate (server preference order)', () => {
    const contentType = determineResponseContentType(requestWithAccept('*/*'), [
      'application/json',
      'text/event-stream',
    ])

    expect(contentType).toBe('application/json')
  })

  it('matches a type/* wildcard against the candidate subtype', () => {
    const contentType = determineResponseContentType(requestWithAccept('text/*'), [
      'application/json',
      'text/event-stream',
    ])

    expect(contentType).toBe('text/event-stream')
  })

  it('prefers a more specific accepted type over a wildcard at equal quality', () => {
    const contentType = determineResponseContentType(requestWithAccept('*/*, text/event-stream'), [
      'application/json',
      'text/event-stream',
    ])

    expect(contentType).toBe('text/event-stream')
  })

  it('matches media types case-insensitively', () => {
    const contentType = determineResponseContentType(requestWithAccept('Application/JSON'), [
      'application/json',
    ])

    expect(contentType).toBe('application/json')
  })

  it('returns null when the request has no Accept header', () => {
    expect(determineResponseContentType(requestWithAccept(), ['application/json'])).toBeNull()
  })

  it('returns null when no candidate is acceptable', () => {
    const contentType = determineResponseContentType(requestWithAccept('image/png'), [
      'application/json',
      'text/event-stream',
    ])

    expect(contentType).toBeNull()
  })
})

describe('buildApiSSEContext', () => {
  const eventSchemas: SseSchemaByEventName = {
    update: z.object({ value: z.number() }),
  }

  const buildSseReply = (sseOverrides: Record<string, unknown> = {}) => {
    const sse = {
      keepAlive: vi.fn(),
      sendHeaders: vi.fn(),
      send: vi.fn().mockResolvedValue(undefined),
      stream: vi.fn(),
      close: vi.fn(),
      onClose: vi.fn(),
      replay: vi.fn(),
      isConnected: true,
      lastEventId: undefined as string | undefined,
      ...sseOverrides,
    }
    const raw = { flushHeaders: vi.fn() }
    const reply = { sse, raw } as unknown as FastifyReply
    return { reply, sse, raw }
  }

  const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve))

  describe('start', () => {
    it('sends the SSE headers and marks the context as started', () => {
      const { reply, sse, raw } = buildSseReply()
      const { sseContext, isStarted } = buildApiSSEContext(
        requestWithAccept(),
        reply,
        eventSchemas,
        undefined,
      )

      expect(isStarted()).toBe(false)
      sseContext.start('autoClose')

      expect(isStarted()).toBe(true)
      expect(sse.sendHeaders).toHaveBeenCalled()
      expect(raw.flushHeaders).toHaveBeenCalled()
      expect(sse.keepAlive).not.toHaveBeenCalled()
    })

    it("enables the plugin keep-alive for a 'keepAlive' session", () => {
      const { reply, sse } = buildSseReply()
      const { sseContext } = buildApiSSEContext(requestWithAccept(), reply, eventSchemas, undefined)

      sseContext.start('keepAlive')

      expect(sse.keepAlive).toHaveBeenCalled()
    })

    it('exposes the connection state, stream and start context on the session', () => {
      const stream = Symbol('stream')
      const request = requestWithAccept()
      const { reply } = buildSseReply({ stream: vi.fn(() => stream), isConnected: false })
      const { sseContext } = buildApiSSEContext(request, reply, eventSchemas, undefined)

      const session = sseContext.start('autoClose', { context: { tenant: 'acme' } })

      expect(session.isConnected()).toBe(false)
      expect(session.getStream()).toBe(stream)
      expect(session.context).toEqual({ tenant: 'acme' })
      expect(session.request).toBe(request)
      expect(session.id).toEqual(expect.any(String))
    })
  })

  describe('session.send', () => {
    it('forwards a schema-valid event and resolves true', async () => {
      const { reply, sse } = buildSseReply()
      const { sseContext } = buildApiSSEContext(requestWithAccept(), reply, eventSchemas, undefined)
      const session = sseContext.start('autoClose')

      await expect(session.send('update', { value: 1 }, { id: '7', retry: 100 })).resolves.toBe(
        true,
      )
      expect(sse.send).toHaveBeenCalledWith({
        event: 'update',
        data: { value: 1 },
        id: '7',
        retry: 100,
      })
    })

    it('sends an event without a declared schema unvalidated', async () => {
      const { reply, sse } = buildSseReply()
      const { sseContext } = buildApiSSEContext(requestWithAccept(), reply, eventSchemas, undefined)
      const session = sseContext.start('autoClose')

      await expect(session.send('unschematized', { anything: true })).resolves.toBe(true)
      expect(sse.send).toHaveBeenCalledWith({
        event: 'unschematized',
        data: { anything: true },
        id: undefined,
        retry: undefined,
      })
    })

    it('rejects when the event data fails schema validation', async () => {
      const { reply, sse } = buildSseReply()
      const { sseContext } = buildApiSSEContext(requestWithAccept(), reply, eventSchemas, undefined)
      const session = sseContext.start('autoClose')

      await expect(session.send('update', { value: 'not-a-number' })).rejects.toThrow(
        'SSE event validation failed for event "update"',
      )
      expect(sse.send).not.toHaveBeenCalled()
    })

    it('resolves false when the underlying send fails (e.g. connection closed)', async () => {
      const { reply } = buildSseReply({
        send: vi.fn().mockRejectedValue(new Error('connection closed')),
      })
      const { sseContext } = buildApiSSEContext(requestWithAccept(), reply, eventSchemas, undefined)
      const session = sseContext.start('autoClose')

      await expect(session.send('update', { value: 1 })).resolves.toBe(false)
    })
  })

  describe('close lifecycle', () => {
    const startWithOnClose = (onClose: (s: SSESession, i: SSECloseInitiator) => void) => {
      const { reply, sse } = buildSseReply()
      const { sseContext, markHandlerDone } = buildApiSSEContext(
        requestWithAccept(),
        reply,
        eventSchemas,
        { onClose },
      )
      const session = sseContext.start('keepAlive')
      const fireClose = sse.onClose.mock.calls[0]?.[0] as () => void
      return { session, sse, markHandlerDone, fireClose }
    }

    it("session.close() closes the reply and reports 'server' as the initiator", () => {
      const onClose = vi.fn()
      const { session, sse, fireClose } = startWithOnClose(onClose)

      session.close()
      fireClose()

      expect(sse.close).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalledWith(session, 'server')
    })

    it("reports 'client' when the connection closes without a server-side close", () => {
      const onClose = vi.fn()
      const { session, fireClose } = startWithOnClose(onClose)

      fireClose()

      expect(onClose).toHaveBeenCalledWith(session, 'client')
    })

    it('markHandlerDone() marks an autoClose session close as server-initiated', () => {
      const onClose = vi.fn()
      const { reply, sse } = buildSseReply()
      const { sseContext, markHandlerDone } = buildApiSSEContext(
        requestWithAccept(),
        reply,
        eventSchemas,
        { onClose },
      )
      const session = sseContext.start('autoClose')

      markHandlerDone()
      ;(sse.onClose.mock.calls[0]?.[0] as () => void)()

      expect(onClose).toHaveBeenCalledWith(session, 'server')
    })

    it('markHandlerDone() leaves a keepAlive session close client-initiated', () => {
      const onClose = vi.fn()
      const { markHandlerDone, fireClose, session } = startWithOnClose(onClose)

      markHandlerDone()
      fireClose()

      expect(onClose).toHaveBeenCalledWith(session, 'client')
    })

    it('swallows a rejecting onClose hook', async () => {
      const { fireClose } = startWithOnClose(vi.fn().mockRejectedValue(new Error('boom')))

      expect(() => fireClose()).not.toThrow()
      await flushMicrotasks()
    })
  })

  describe('onConnect', () => {
    it('invokes onConnect with the started session', () => {
      const onConnect = vi.fn()
      const { reply } = buildSseReply()
      const { sseContext } = buildApiSSEContext(requestWithAccept(), reply, eventSchemas, {
        onConnect,
      })

      const session = sseContext.start('keepAlive')

      expect(onConnect).toHaveBeenCalledWith(session)
    })

    it('swallows a rejecting onConnect hook', async () => {
      const onConnect = vi.fn().mockRejectedValue(new Error('boom'))
      const { reply } = buildSseReply()
      const { sseContext } = buildApiSSEContext(requestWithAccept(), reply, eventSchemas, {
        onConnect,
      })

      expect(() => sseContext.start('keepAlive')).not.toThrow()
      await flushMicrotasks()
    })
  })

  describe('onReconnect', () => {
    it('replays the events returned by onReconnect for a reconnecting client', async () => {
      const { reply, sse } = buildSseReply({ lastEventId: '42' })
      const onReconnect = vi
        .fn()
        .mockResolvedValue([
          { event: 'update', data: { value: 1 }, id: '43' },
        ] satisfies SSEMessage[])
      const { sseContext } = buildApiSSEContext(requestWithAccept(), reply, eventSchemas, {
        onReconnect,
      })

      const session = sseContext.start('keepAlive')
      const replayCallback = sse.replay.mock.calls[0]?.[0] as () => Promise<void>
      await replayCallback()

      expect(onReconnect).toHaveBeenCalledWith(session, '42')
      expect(sse.send).toHaveBeenCalledWith({ event: 'update', data: { value: 1 }, id: '43' })
    })

    it('replays nothing when onReconnect handles the reconnection itself', async () => {
      const { reply, sse } = buildSseReply({ lastEventId: '42' })
      const onReconnect = vi.fn().mockResolvedValue(undefined)
      const { sseContext } = buildApiSSEContext(requestWithAccept(), reply, eventSchemas, {
        onReconnect,
      })

      sseContext.start('keepAlive')
      await (sse.replay.mock.calls[0]?.[0] as () => Promise<void>)()

      expect(onReconnect).toHaveBeenCalled()
      expect(sse.send).not.toHaveBeenCalled()
    })

    it('does not replay when the request carries no Last-Event-ID', () => {
      const { reply, sse } = buildSseReply()
      const { sseContext } = buildApiSSEContext(requestWithAccept(), reply, eventSchemas, {
        onReconnect: vi.fn(),
      })

      sseContext.start('keepAlive')

      expect(sse.replay).not.toHaveBeenCalled()
    })
  })
})
