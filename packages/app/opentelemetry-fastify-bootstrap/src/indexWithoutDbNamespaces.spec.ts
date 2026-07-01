import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { type FastifyInstance, fastify } from 'fastify'
import { gracefulOtelShutdown, initOpenTelemetry } from './index.ts'

// initOpenTelemetry can only run once per process (global SDK hooks don't
// cleanly re-register), so the default path — SDK enabled, no dbNamespaceBySystem —
// gets its own spec file. This is the path every existing consumer takes;
// it must never crash or change behavior because of the dbNamespaceBySystem feature.
describe('initOpenTelemetry enabled without dbNamespaceBySystem', () => {
  let app: FastifyInstance | undefined
  const memoryExporter = new InMemorySpanExporter()
  const originalNodeEnv = process.env.NODE_ENV
  const originalOtelEnabled = process.env.OTEL_ENABLED
  const originalExporterUrl = process.env.OTEL_EXPORTER_URL

  beforeAll(() => {
    process.env.NODE_ENV = 'production'
    process.env.OTEL_ENABLED = 'true'
    // Definitely-unreachable port so background exports fail fast.
    process.env.OTEL_EXPORTER_URL = 'grpc://127.0.0.1:1'
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterAll(async () => {
    await gracefulOtelShutdown()
    // Restore the process-global env we mutated so this file can't influence
    // another spec that shares the worker.
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnv
    if (originalOtelEnabled === undefined) delete process.env.OTEL_ENABLED
    else process.env.OTEL_ENABLED = originalOtelEnabled
    if (originalExporterUrl === undefined) delete process.env.OTEL_EXPORTER_URL
    else process.env.OTEL_EXPORTER_URL = originalExporterUrl
    vi.restoreAllMocks()
  })

  afterEach(async () => {
    await app?.close()
    app = undefined
  })

  it('initializes and traces without the db.namespace exporter', async () => {
    expect(() =>
      initOpenTelemetry({
        spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
      }),
    ).not.toThrow()

    app = fastify()
    app.get('/users', async () => ({ ok: true }))
    await app.ready()

    const response = await app.inject().get('/users').end()
    expect(response.statusCode).toBe(200)

    await vi.waitFor(
      () => {
        expect(memoryExporter.getFinishedSpans().length).toBeGreaterThan(0)
      },
      { timeout: 2000, interval: 10 },
    )

    // No dbNamespaceBySystem configured — nothing may add db.namespace.
    for (const span of memoryExporter.getFinishedSpans()) {
      expect(span.attributes['db.namespace']).toBeUndefined()
    }
  })
})
