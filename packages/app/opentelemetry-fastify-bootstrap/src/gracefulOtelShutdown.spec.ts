import { NodeSDK } from '@opentelemetry/sdk-node'
import { gracefulOtelShutdown, initOpenTelemetry } from './index.ts'

// initOpenTelemetry can only run once per process, so the timeout path gets its own spec file.
describe('gracefulOtelShutdown with a hung SDK shutdown', () => {
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
    initOpenTelemetry()
  })

  afterAll(async () => {
    vi.restoreAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await gracefulOtelShutdown()
    vi.restoreAllMocks()
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnv
    if (originalOtelEnabled === undefined) delete process.env.OTEL_ENABLED
    else process.env.OTEL_ENABLED = originalOtelEnabled
    if (originalExporterUrl === undefined) delete process.env.OTEL_EXPORTER_URL
    else process.env.OTEL_EXPORTER_URL = originalExporterUrl
  })

  it('stops waiting after the timeout and logs a warning', async () => {
    const shutdownSpy = vi
      .spyOn(NodeSDK.prototype, 'shutdown')
      .mockReturnValue(new Promise<void>(() => {}))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(gracefulOtelShutdown({ timeoutMs: 10 })).resolves.toBeUndefined()

    expect(shutdownSpy).toHaveBeenCalledOnce()
    expect(warnSpy).toHaveBeenCalledOnce()
    expect(JSON.parse(warnSpy.mock.calls[0]?.[0] as string)).toMatchObject({
      level: 'warn',
      timeoutMs: 10,
      msg: '[OTEL] SDK shutdown timed out, spans still buffered are lost',
    })
  })
})
