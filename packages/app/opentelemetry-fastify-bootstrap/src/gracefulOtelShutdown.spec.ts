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

  it('logs a shutdown that fails after the timeout', async () => {
    let reject: (error: Error) => void = () => {}
    const promise = new Promise<void>((_, rejectPromise) => {
      reject = rejectPromise
    })
    vi.spyOn(NodeSDK.prototype, 'shutdown').mockReturnValue(promise)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    errorSpy.mockClear()

    await gracefulOtelShutdown({ timeoutMs: 10 })
    reject(new Error('late failure'))

    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledOnce())
    expect(JSON.parse(errorSpy.mock.calls[0]?.[0] as string)).toMatchObject({
      level: 'error',
      msg: '[OTEL] Error during SDK shutdown',
    })
  })

  it('logs a shutdown that completes after the timeout', async () => {
    let resolve: () => void = () => {}
    const promise = new Promise<void>((resolvePromise) => {
      resolve = resolvePromise
    })
    vi.spyOn(NodeSDK.prototype, 'shutdown').mockReturnValue(promise)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await gracefulOtelShutdown({ timeoutMs: 10 })
    logSpy.mockClear()
    resolve()

    await vi.waitFor(() =>
      expect(logSpy.mock.calls.map(([output]) => JSON.parse(output as string).msg)).toContain(
        '[OTEL] SDK shutdown completed successfully',
      ),
    )
  })
})
