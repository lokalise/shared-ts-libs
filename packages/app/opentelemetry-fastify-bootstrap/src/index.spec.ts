import { setTimeout as sleep } from 'node:timers/promises'
import { trace } from '@opentelemetry/api'
import {
  InMemorySpanExporter,
  type ReadableSpan,
  SimpleSpanProcessor,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base'
import { type FastifyInstance, fastify } from 'fastify'
import { gracefulOtelShutdown, initOpenTelemetry } from './index.ts'

const ORIGINAL_NODE_ENV = process.env.NODE_ENV
const ORIGINAL_OTEL_ENABLED = process.env.OTEL_ENABLED
const ORIGINAL_OTEL_EXPORTER_URL = process.env.OTEL_EXPORTER_URL

function setEnabledEnv(): void {
  process.env.NODE_ENV = 'production'
  process.env.OTEL_ENABLED = 'true'
  // Point gRPC exporter at a definitely-unreachable port so background
  // exports fail fast and never connect to a real collector during tests.
  process.env.OTEL_EXPORTER_URL = 'grpc://127.0.0.1:1'
}

function restoreEnv(): void {
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV
  if (ORIGINAL_OTEL_ENABLED === undefined) delete process.env.OTEL_ENABLED
  else process.env.OTEL_ENABLED = ORIGINAL_OTEL_ENABLED
  if (ORIGINAL_OTEL_EXPORTER_URL === undefined) delete process.env.OTEL_EXPORTER_URL
  else process.env.OTEL_EXPORTER_URL = ORIGINAL_OTEL_EXPORTER_URL
}

/**
 * Wait until the exporter has at least `minCount` finished spans. Spans flow
 * through SimpleSpanProcessor -> _doExport, which is async because OpenTelemetry
 * resource detection may still be pending — a single microtask is not enough.
 */
function waitForSpans(exporter: InMemorySpanExporter, minCount = 1): Promise<void> {
  return vi.waitFor(
    () => {
      expect(exporter.getFinishedSpans().length).toBeGreaterThanOrEqual(minCount)
    },
    { timeout: 2000, interval: 10 },
  )
}

/**
 * Wait `ms` milliseconds (default 100). Used in "should not emit" tests to give
 * any potential late span exports a chance to land before we assert emptiness.
 */
function settle(ms = 100): Promise<void> {
  return sleep(ms)
}

function isFastifySpan(span: ReadableSpan): boolean {
  return span.instrumentationScope.name.includes('fastify')
}

function spanMentions(span: ReadableSpan, fragment: string): boolean {
  const haystack = JSON.stringify({ name: span.name, attrs: span.attributes })
  return haystack.includes(fragment)
}

describe('opentelemetry-fastify-bootstrap', () => {
  // ---------------------------------------------------------------------------
  // Disabled paths: these never start the SDK, so they can run independently
  // and in any order without leaking global OpenTelemetry state.
  // ---------------------------------------------------------------------------
  describe('when disabled by environment', () => {
    let app: FastifyInstance | undefined
    let memoryExporter: InMemorySpanExporter
    let consoleDirSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      memoryExporter = new InMemorySpanExporter()
      // Re-install impls every test because vitest config `mockReset: true`
      // wipes mockImplementation between tests and reverts spies to pass-through.
      consoleDirSpy = vi.spyOn(console, 'dir').mockImplementation(() => {})
      vi.spyOn(console, 'log').mockImplementation(() => {})
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(async () => {
      await app?.close()
      app = undefined
      vi.restoreAllMocks()
      restoreEnv()
    })

    it('does not initialize the SDK when NODE_ENV is "test"', async () => {
      process.env.NODE_ENV = 'test'
      process.env.OTEL_ENABLED = 'true'

      initOpenTelemetry({
        consoleSpans: true,
        spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
      })

      app = fastify()
      app.get('/x', async () => 'x')
      await app.ready()
      await app.inject().get('/x').end()
      await settle()

      expect(memoryExporter.getFinishedSpans()).toHaveLength(0)
      expect(consoleDirSpy).not.toHaveBeenCalled()
    })

    it('does not initialize the SDK when OTEL_ENABLED is "false"', async () => {
      process.env.NODE_ENV = 'production'
      process.env.OTEL_ENABLED = 'false'

      initOpenTelemetry({
        consoleSpans: true,
        spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
      })

      app = fastify()
      app.get('/x', async () => 'x')
      await app.ready()
      await app.inject().get('/x').end()
      await settle()

      expect(memoryExporter.getFinishedSpans()).toHaveLength(0)
      expect(consoleDirSpy).not.toHaveBeenCalled()
    })

    it('does not initialize the SDK when OTEL_ENABLED is unset', async () => {
      process.env.NODE_ENV = 'production'
      delete process.env.OTEL_ENABLED

      initOpenTelemetry({
        consoleSpans: true,
        spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
      })

      app = fastify()
      app.get('/x', async () => 'x')
      await app.ready()
      await app.inject().get('/x').end()
      await settle()

      expect(memoryExporter.getFinishedSpans()).toHaveLength(0)
    })

    it('does not initialize the SDK when OTEL_ENABLED has a non-true value', async () => {
      process.env.NODE_ENV = 'production'
      process.env.OTEL_ENABLED = 'yes'

      initOpenTelemetry({
        consoleSpans: true,
        spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
      })

      app = fastify()
      app.get('/x', async () => 'x')
      await app.ready()
      await app.inject().get('/x').end()
      await settle()

      expect(memoryExporter.getFinishedSpans()).toHaveLength(0)
    })

    it('throws on a misconfigured peerDbNames mapping even when OTEL is disabled', () => {
      // Validation is hoisted above the enabled gate so a typo'd mapping
      // fails in dev/CI (where OTEL is off) instead of only at prod startup.
      process.env.NODE_ENV = 'test'

      expect(() => initOpenTelemetry({ peerDbNames: { elasticsearch: '' } })).toThrow(/non-empty/)
    })

    it('warns when peerDbNames is provided but empty', () => {
      process.env.NODE_ENV = 'test'
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      initOpenTelemetry({ peerDbNames: {} })

      const warned = consoleWarnSpy.mock.calls.map((call: unknown[]) => String(call[0])).join('\n')
      expect(warned).toContain('peerDbNames was provided but contains no entries')
    })
  })

  // ---------------------------------------------------------------------------
  // gracefulOtelShutdown without a prior init: must come before any test that
  // starts the SDK, since module-level `sdk` is set on init and stays set.
  // ---------------------------------------------------------------------------
  describe('gracefulOtelShutdown without prior init', () => {
    it('is a no-op when no SDK was ever started', async () => {
      await expect(gracefulOtelShutdown()).resolves.toBeUndefined()
    })
  })

  // ---------------------------------------------------------------------------
  // Fully enabled: single SDK lifecycle. Init once in beforeAll, shutdown once
  // in afterAll. Each test reuses the same SDK + processors and resets only
  // the in-memory exporters and console spies between tests.
  //
  // We can't safely call initOpenTelemetry multiple times in one process
  // because @opentelemetry/sdk-node + @fastify/otel rely on global hooks that
  // don't cleanly re-register after shutdown.
  // ---------------------------------------------------------------------------
  describe('when fully enabled', () => {
    let app: FastifyInstance | undefined
    const memoryExporter = new InMemorySpanExporter()
    const secondaryExporter = new InMemorySpanExporter()
    // Synchronously snapshots attributes in onEnd. InMemorySpanExporter holds
    // live span references, so it observes in-place mutations regardless of
    // processor order — only an eager copy like this can detect whether the
    // peer processor ran BEFORE user-supplied processors.
    const attributeSnapshots: Array<Record<string, unknown>> = []
    const snapshotProcessor: SpanProcessor = {
      onStart() {},
      onEnd(span) {
        attributeSnapshots.push({ ...span.attributes })
      },
      forceFlush: () => Promise.resolve(),
      shutdown: () => Promise.resolve(),
    }
    let consoleDirSpy: ReturnType<typeof vi.spyOn>
    let consoleLogSpy: ReturnType<typeof vi.spyOn>
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>

    beforeAll(() => {
      setEnabledEnv()
      consoleDirSpy = vi.spyOn(console, 'dir').mockImplementation(() => {})
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      initOpenTelemetry({
        consoleSpans: true,
        skippedPaths: ['/health', '/metrics', '/skip-me'],
        spanProcessors: [
          new SimpleSpanProcessor(memoryExporter),
          new SimpleSpanProcessor(secondaryExporter),
          snapshotProcessor,
        ],
        peerDbNames: { elasticsearch: 'lokalise' },
      })
    })

    afterAll(async () => {
      await gracefulOtelShutdown()
      consoleDirSpy.mockRestore()
      consoleLogSpy.mockRestore()
      consoleErrorSpy.mockRestore()
      consoleWarnSpy.mockRestore()
      restoreEnv()
    })

    beforeEach(() => {
      memoryExporter.reset()
      secondaryExporter.reset()
      attributeSnapshots.length = 0
      // vitest config `mockReset: true` wipes mockImplementation between tests
      // and reverts spies to pass-through. Re-install no-op impls each test.
      consoleDirSpy.mockImplementation(() => {})
      consoleLogSpy.mockImplementation(() => {})
      consoleErrorSpy.mockImplementation(() => {})
      consoleWarnSpy.mockImplementation(() => {})
      consoleDirSpy.mockClear()
      consoleLogSpy.mockClear()
      consoleErrorSpy.mockClear()
      consoleWarnSpy.mockClear()
    })

    afterEach(async () => {
      await app?.close()
      app = undefined
    })

    it('emits spans for fastify route handlers via the custom span processor', async () => {
      app = fastify()
      app.get('/users', async () => ({ users: [{ id: 1, name: 'Alice' }] }))
      await app.ready()

      const response = await app.inject().get('/users').end()
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ users: [{ id: 1, name: 'Alice' }] })

      await waitForSpans(memoryExporter, 1)

      const spans = memoryExporter.getFinishedSpans()
      expect(spans.length).toBeGreaterThan(0)

      const fastifySpans = spans.filter(isFastifySpan)
      expect(fastifySpans.length).toBeGreaterThan(0)

      const usersSpan = fastifySpans.find((span) => spanMentions(span, '/users'))
      expect(usersSpan).toBeDefined()
    })

    it('prints spans to the console via ConsoleSpanExporter (consoleSpans: true)', async () => {
      app = fastify()
      app.get('/orders', async () => ({ orders: [] }))
      await app.ready()

      await app.inject().get('/orders').end()
      await waitForSpans(memoryExporter, 1)
      // ConsoleSpanExporter uses a SimpleSpanProcessor (sync) — once the
      // memory exporter has spans, the console exporter has been called too.
      expect(consoleDirSpy).toHaveBeenCalled()

      const printedPayloads = consoleDirSpy.mock.calls.map((call: unknown[]) => call[0])
      const looksLikeSpan = printedPayloads.some(
        (payload: unknown) =>
          typeof payload === 'object' &&
          payload !== null &&
          'name' in payload &&
          'traceId' in payload &&
          'id' in payload,
      )
      expect(looksLikeSpan).toBe(true)
    })

    it('forwards spans to every configured custom span processor', async () => {
      app = fastify()
      app.get('/ping', async () => 'pong')
      await app.ready()

      await app.inject().get('/ping').end()
      await waitForSpans(memoryExporter, 1)
      await waitForSpans(secondaryExporter, 1)

      const firstSpans = memoryExporter.getFinishedSpans()
      const secondSpans = secondaryExporter.getFinishedSpans()

      expect(firstSpans.length).toBeGreaterThan(0)
      expect(secondSpans.length).toBeGreaterThan(0)
      expect(firstSpans.length).toBe(secondSpans.length)
    })

    it('excludes skippedPaths from fastify route tracing', async () => {
      app = fastify()
      app.get('/health', async () => ({ ok: true }))
      app.get('/metrics', async () => 'metrics-data')
      app.get('/skip-me', async () => 'skipped')
      app.get('/api/users', async () => ({ users: [] }))
      await app.ready()

      const healthRes = await app.inject().get('/health').end()
      const metricsRes = await app.inject().get('/metrics').end()
      const skipRes = await app.inject().get('/skip-me').end()
      const usersRes = await app.inject().get('/api/users').end()

      // All routes still work — they're only excluded from tracing, not from execution
      expect(healthRes.statusCode).toBe(200)
      expect(metricsRes.statusCode).toBe(200)
      expect(skipRes.statusCode).toBe(200)
      expect(usersRes.statusCode).toBe(200)

      // Wait for the /api/users span specifically — skipped routes won't emit
      // fastify spans, so we anchor on the one that's expected to appear.
      await waitForSpans(memoryExporter, 1)
      // Allow a short settle window so any (unexpected) spans from skipped
      // paths would have time to land too.
      await settle(50)

      const fastifySpans = memoryExporter.getFinishedSpans().filter(isFastifySpan)

      const apiSpans = fastifySpans.filter((span) => spanMentions(span, '/api/users'))
      const healthSpans = fastifySpans.filter((span) => spanMentions(span, '/health'))
      const metricsSpans = fastifySpans.filter((span) => spanMentions(span, '/metrics'))
      const skipSpans = fastifySpans.filter((span) => spanMentions(span, '/skip-me'))

      expect(apiSpans.length).toBeGreaterThan(0)
      expect(healthSpans).toHaveLength(0)
      expect(metricsSpans).toHaveLength(0)
      expect(skipSpans).toHaveLength(0)
    })

    it('matches skippedPaths against the path without its query string', async () => {
      app = fastify()
      app.get('/health', async () => ({ ok: true }))
      await app.ready()

      const res = await app.inject().get('/health?verbose=true&trace=1').end()
      expect(res.statusCode).toBe(200)

      // Give any potential late span exports time to land before asserting empty
      await settle(150)

      const fastifySpansForHealth = memoryExporter
        .getFinishedSpans()
        .filter(isFastifySpan)
        .filter((span) => spanMentions(span, '/health'))
      expect(fastifySpansForHealth).toHaveLength(0)
    })

    it('logs that OpenTelemetry is already registered on a second initOpenTelemetry call', async () => {
      consoleLogSpy.mockClear()
      const noopExporter = new InMemorySpanExporter()

      // Second init while already registered should early-return without
      // throwing and without attaching the new processor.
      expect(() =>
        initOpenTelemetry({
          spanProcessors: [new SimpleSpanProcessor(noopExporter)],
        }),
      ).not.toThrow()

      // Verify the disabled/already-registered log was emitted
      const loggedMessages = consoleLogSpy.mock.calls
        .map((call: unknown[]) => (typeof call[0] === 'string' ? call[0] : ''))
        .join('\n')
      expect(loggedMessages).toContain('disabled or already registered')

      // Hit a route and make sure the new processor never saw any span,
      // proving the second init did not attach it.
      app = fastify()
      app.get('/after-noop', async () => 'ok')
      await app.ready()
      await app.inject().get('/after-noop').end()
      // Wait for the span to reach the original processor — the new one should
      // never receive it because the second init early-returned.
      await waitForSpans(memoryExporter, 1)
      await settle(50)

      expect(noopExporter.getFinishedSpans()).toHaveLength(0)
      // But the original processor is still active
      expect(memoryExporter.getFinishedSpans().length).toBeGreaterThan(0)
    })

    it('captures spans for multiple route hits in a single fastify instance', async () => {
      app = fastify()
      app.get('/a', async () => 'a')
      app.get('/b', async () => 'b')
      app.get('/c', async () => 'c')
      await app.ready()

      await app.inject().get('/a').end()
      await app.inject().get('/b').end()
      await app.inject().get('/c').end()

      // Fastify instrumentation emits multiple spans per request — wait until
      // we've seen at least 3 (one root span per request, minimum).
      await waitForSpans(memoryExporter, 3)

      const fastifySpans = memoryExporter.getFinishedSpans().filter(isFastifySpan)
      expect(fastifySpans.some((span) => spanMentions(span, '/a'))).toBe(true)
      expect(fastifySpans.some((span) => spanMentions(span, '/b'))).toBe(true)
      expect(fastifySpans.some((span) => spanMentions(span, '/c'))).toBe(true)
    })

    it('produces spans with a valid trace context (traceId + spanId)', async () => {
      app = fastify()
      app.get('/trace-check', async () => 'ok')
      await app.ready()

      await app.inject().get('/trace-check').end()
      await waitForSpans(memoryExporter, 1)

      const fastifySpans = memoryExporter.getFinishedSpans().filter(isFastifySpan)
      expect(fastifySpans.length).toBeGreaterThan(0)

      for (const span of fastifySpans) {
        const ctx = span.spanContext()
        expect(ctx.traceId).toMatch(/^[0-9a-f]{32}$/)
        expect(ctx.spanId).toMatch(/^[0-9a-f]{16}$/)
      }
    })

    // End-to-end check that the peerDbNames option is wired into the SDK and
    // the mutation reaches exporters. The unit-level
    // peerDbNameSpanProcessor.spec.ts covers the mutation rules in isolation;
    // the registration-order contract is pinned separately by the snapshot
    // test below (the in-memory exporter holds live references, so this test
    // alone cannot detect ordering).
    it('stamps db.namespace via the peerDbNames pipeline on outbound DB-like spans', async () => {
      const tracer = trace.getTracer('verify-peer-db-name')
      const span = tracer.startSpan('elasticsearch.query', {
        attributes: { 'db.system': 'elasticsearch' },
      })
      span.end()

      await vi.waitFor(
        () => {
          const dbSpan = memoryExporter
            .getFinishedSpans()
            .find((s) => s.attributes['db.system'] === 'elasticsearch')
          expect(dbSpan).toBeDefined()
          expect(dbSpan?.attributes['db.namespace']).toBe('lokalise')
          expect(dbSpan?.attributes['peer.db.system']).toBe('elasticsearch')
        },
        { timeout: 2000, interval: 10 },
      )
    })

    it('runs the peer processor before user-supplied span processors', () => {
      // MultiSpanProcessor calls onEnd synchronously in registration order;
      // the snapshot processor copies attributes eagerly, so the stamped
      // db.namespace only appears in the snapshot if the peer processor was
      // registered (and therefore ran) first. This is the genuine order pin —
      // it fails if the peer processor is moved after `spanProcessors`.
      const tracer = trace.getTracer('verify-peer-order')
      const span = tracer.startSpan('elasticsearch.order-check', {
        attributes: { 'db.system': 'elasticsearch', 'order.check': true },
      })
      span.end()

      const snapshot = attributeSnapshots.find((attrs) => attrs['order.check'] === true)
      expect(snapshot).toBeDefined()
      expect(snapshot?.['db.namespace']).toBe('lokalise')
      expect(snapshot?.['peer.db.system']).toBe('elasticsearch')
    })

    it('does not stamp anything on spans without a matching db.system', async () => {
      // Guards against the processor ever leaking attributes onto fastify or
      // other unrelated spans. The configured mapping is { elasticsearch },
      // so a redis-tagged span should pass through untouched.
      const tracer = trace.getTracer('verify-peer-db-name')
      const span = tracer.startSpan('redis.cmd', {
        attributes: { 'db.system': 'redis' },
      })
      span.end()

      await vi.waitFor(
        () => {
          const redisSpan = memoryExporter
            .getFinishedSpans()
            .find((s) => s.attributes['db.system'] === 'redis')
          expect(redisSpan).toBeDefined()
          expect(redisSpan?.attributes['db.namespace']).toBeUndefined()
        },
        { timeout: 2000, interval: 10 },
      )
    })
  })
})
