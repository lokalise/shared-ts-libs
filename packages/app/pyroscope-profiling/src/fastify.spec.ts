import fastify from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type PyroscopeProfilingPluginOptions, pyroscopeProfilingPlugin } from './fastify.ts'
import type { ProfilingConfig } from './types.ts'

const wallProfiler = vi.hoisted(() => ({
  getWallLabels: vi.fn(() => ({}) as Record<string, string | number>),
  setWallLabels: vi.fn(),
}))

const profiler = vi.hoisted(() => ({
  startProfiling: vi.fn(),
  stopProfiling: vi.fn(),
  runningProfiler: vi.fn(),
  isProfilingRunningAfterStart: vi.fn(),
}))

vi.mock('./profiler.ts', () => profiler)

const profilerRunning = () => {
  profiler.runningProfiler.mockReturnValue({ default: wallProfiler })
}

const ENABLED_CONFIG: ProfilingConfig = {
  isEnabled: true,
  appName: 'my-service',
  serverAddress: 'http://pyroscope.test:4040',
}

const buildApp = async (
  options: PyroscopeProfilingPluginOptions,
  addRoutes?: (app: ReturnType<typeof fastify>) => void,
) => {
  const app = fastify({ logger: false })
  await app.register(pyroscopeProfilingPlugin, options)
  addRoutes?.(app)
  await app.ready()
  return app
}

describe('pyroscopeProfilingPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // The plugin falls back to the PYROSCOPE_* environment when it is handed no
    // config, so a dev shell or a CI runner that exports one of these decides
    // what the fallback test asserts on.
    vi.stubEnv('PYROSCOPE_ENABLED', undefined)
    vi.stubEnv('PYROSCOPE_APPLICATION_NAME', undefined)
    profiler.startProfiling.mockResolvedValue(true)
    profiler.stopProfiling.mockResolvedValue(undefined)
    profiler.runningProfiler.mockReturnValue(undefined)
    profiler.isProfilingRunningAfterStart.mockResolvedValue(false)
    wallProfiler.getWallLabels.mockReturnValue({})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('starts profiling with the config it was handed', async () => {
    const app = await buildApp({ config: ENABLED_CONFIG, context: { appEnv: 'staging' } })

    expect(profiler.startProfiling).toHaveBeenCalledWith(
      ENABLED_CONFIG,
      { appEnv: 'staging' },
      app.log,
    )

    await app.close()
  })

  it('falls back to the environment, with the app name as the default profile name', async () => {
    const app = await buildApp({ appName: 'my-service' })

    expect(profiler.startProfiling).toHaveBeenCalledWith(
      expect.objectContaining({ appName: 'my-service', isEnabled: false }),
      expect.any(Object),
      app.log,
    )

    await app.close()
  })

  it('flushes the last profile window when the app closes', async () => {
    const app = await buildApp({ config: ENABLED_CONFIG })

    await app.close()

    expect(profiler.stopProfiling).toHaveBeenCalledWith(app.log)
  })

  // The entry point is the only place that can start the profiler before the
  // app exists, which is what gets startup into the first profile window. The
  // flush hook is still worth registering.
  it('registers the flush without starting when the entry point already did', async () => {
    const app = await buildApp({ config: ENABLED_CONFIG, start: false })

    expect(profiler.startProfiling).not.toHaveBeenCalled()

    await app.close()
    expect(profiler.stopProfiling).toHaveBeenCalledOnce()
  })

  it('logs through the logger it was given rather than the app one', async () => {
    const logger = {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    }
    const app = await buildApp({ config: ENABLED_CONFIG, logger })

    expect(profiler.startProfiling).toHaveBeenCalledWith(ENABLED_CONFIG, expect.any(Object), logger)

    await app.close()
    expect(profiler.stopProfiling).toHaveBeenCalledWith(logger)
  })

  it('is registered at the root, so a nested register still flushes on close', async () => {
    const app = fastify({ logger: false })
    await app.register(async (instance) => {
      await instance.register(pyroscopeProfilingPlugin, { config: ENABLED_CONFIG })
    })
    await app.ready()

    await app.close()

    expect(profiler.stopProfiling).toHaveBeenCalledOnce()
  })

  // An OpenTelemetry HTTP server span is named `POST` until the response has
  // gone out, so the span processor can only ever label a request by its
  // method. Fastify knows the route from the first hook, which is what makes
  // `--select 'span_name="POST /v1/content/:id"'` return anything.
  describe('request labels', () => {
    const withRoute = (app: ReturnType<typeof fastify>) => {
      app.post('/v1/content/:id', async () => ({ ok: true }))
    }

    it('labels the samples taken during a request with its route', async () => {
      profilerRunning()
      const app = await buildApp({ config: ENABLED_CONFIG }, withRoute)

      const response = await app.inject({ method: 'POST', url: '/v1/content/7' })

      expect(response.statusCode).toBe(200)
      expect(wallProfiler.setWallLabels).toHaveBeenCalledWith({
        span_name: 'POST /v1/content/:id',
      })
      // And hands them back, so nothing taken after the response carries the
      // route it was serving.
      expect(wallProfiler.setWallLabels).toHaveBeenLastCalledWith({})

      await app.close()
    })

    it('labels a request that matched no route by its method alone', async () => {
      profilerRunning()
      const app = await buildApp({ config: ENABLED_CONFIG })

      await app.inject({ method: 'GET', url: '/nothing-here' })

      expect(wallProfiler.setWallLabels).toHaveBeenCalledWith({ span_name: 'GET' })

      await app.close()
    })

    it('leaves the requests alone when asked to', async () => {
      profilerRunning()
      const app = await buildApp({ config: ENABLED_CONFIG, labelRequests: false }, withRoute)

      await app.inject({ method: 'POST', url: '/v1/content/7' })

      expect(wallProfiler.setWallLabels).not.toHaveBeenCalled()

      await app.close()
    })

    it('serves the request when the profiler refuses the labels', async () => {
      profilerRunning()
      wallProfiler.setWallLabels.mockImplementation(() => {
        throw new Error('contexts are not supported')
      })
      const app = await buildApp({ config: ENABLED_CONFIG }, withRoute)

      const response = await app.inject({ method: 'POST', url: '/v1/content/7' })

      expect(response.statusCode).toBe(200)

      await app.close()
      wallProfiler.setWallLabels.mockReset()
    })

    // A client that disconnects never reaches onResponse, so without the abort
    // hook the scope stays open until the 1024-scope bound reclaims it, and its
    // `span_name` is reapplied to whatever the process does in the meantime.
    // Needs a real socket: `inject` cannot mark a request aborted.
    it('hands the labels back when the client disconnects mid-request', async () => {
      profilerRunning()
      const app = fastify({ logger: false })
      await app.register(pyroscopeProfilingPlugin, { config: ENABLED_CONFIG })
      app.post('/v1/content/:id', () => new Promise(() => {}))
      const address = await app.listen({ port: 0, host: '127.0.0.1' })

      try {
        const abort = new AbortController()
        const response = fetch(`${address}/v1/content/7`, {
          method: 'POST',
          signal: abort.signal,
        })

        await vi.waitFor(() =>
          expect(wallProfiler.setWallLabels).toHaveBeenCalledWith({
            span_name: 'POST /v1/content/:id',
          }),
        )
        abort.abort()

        await expect(response).rejects.toThrow()
        await vi.waitFor(() => expect(wallProfiler.setWallLabels).toHaveBeenLastCalledWith({}))
      } finally {
        await app.close()
      }
    })

    // The wall profiler stays mocked as running in these, so a label that
    // shows up could only have come from hooks the plugin should not have
    // registered.
    it('registers no hooks when the start left profiling off', async () => {
      profilerRunning()
      profiler.startProfiling.mockResolvedValue(false)
      const app = await buildApp({ config: ENABLED_CONFIG }, withRoute)

      await app.inject({ method: 'POST', url: '/v1/content/7' })

      expect(wallProfiler.setWallLabels).not.toHaveBeenCalled()

      await app.close()
    })

    it('labels requests when the entry point left profiling running', async () => {
      profilerRunning()
      profiler.isProfilingRunningAfterStart.mockResolvedValue(true)
      const app = await buildApp({ config: ENABLED_CONFIG, start: false }, withRoute)

      await app.inject({ method: 'POST', url: '/v1/content/7' })

      expect(wallProfiler.setWallLabels).toHaveBeenCalledWith({
        span_name: 'POST /v1/content/:id',
      })

      await app.close()
    })

    it('registers no hooks when the entry point left profiling off', async () => {
      profilerRunning()
      const app = await buildApp({ config: ENABLED_CONFIG, start: false }, withRoute)

      await app.inject({ method: 'POST', url: '/v1/content/7' })

      expect(wallProfiler.setWallLabels).not.toHaveBeenCalled()

      await app.close()
    })

    it('labels requests when asked to, whatever the start did', async () => {
      profilerRunning()
      profiler.startProfiling.mockResolvedValue(false)
      const app = await buildApp({ config: ENABLED_CONFIG, labelRequests: true }, withRoute)

      await app.inject({ method: 'POST', url: '/v1/content/7' })

      expect(wallProfiler.setWallLabels).toHaveBeenCalledWith({
        span_name: 'POST /v1/content/:id',
      })

      await app.close()
    })

    it('does nothing per request while profiling is off', async () => {
      const app = await buildApp({ config: ENABLED_CONFIG }, withRoute)

      await app.inject({ method: 'POST', url: '/v1/content/7' })

      expect(wallProfiler.setWallLabels).not.toHaveBeenCalled()

      await app.close()
    })
  })
})
