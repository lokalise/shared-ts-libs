import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { type FastifyInstance, fastify } from 'fastify'
import { gracefulOtelShutdown, initOpenTelemetry } from './index.ts'

// initOpenTelemetry can only run once per process (global SDK hooks don't
// cleanly re-register), so the default path — SDK enabled, no peerDbNames —
// gets its own spec file. This is the path every existing consumer takes;
// it must never crash or change behavior because of the peerDbNames feature.
describe('initOpenTelemetry enabled without peerDbNames', () => {
  let app: FastifyInstance | undefined
  const memoryExporter = new InMemorySpanExporter()

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
    vi.restoreAllMocks()
  })

  afterEach(async () => {
    await app?.close()
    app = undefined
  })

  it('initializes and traces without a peer DB processor', async () => {
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

    // No peer processor configured — nothing may stamp peer DB attributes.
    for (const span of memoryExporter.getFinishedSpans()) {
      expect(span.attributes['db.namespace']).toBeUndefined()
    }
  })
})
