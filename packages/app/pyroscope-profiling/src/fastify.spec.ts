import fastify from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type PyroscopeProfilingPluginOptions, pyroscopeProfilingPlugin } from './fastify.ts'
import type { ProfilingConfig } from './types.ts'

const profiler = vi.hoisted(() => ({
  startProfiling: vi.fn(),
  stopProfiling: vi.fn(),
}))

vi.mock('./profiler.ts', () => profiler)

const ENABLED_CONFIG: ProfilingConfig = {
  isEnabled: true,
  appName: 'my-service',
  serverAddress: 'http://pyroscope.test:4040',
}

const buildApp = async (options: PyroscopeProfilingPluginOptions) => {
  const app = fastify({ logger: false })
  await app.register(pyroscopeProfilingPlugin, options)
  await app.ready()
  return app
}

describe('pyroscopeProfilingPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    profiler.startProfiling.mockResolvedValue(true)
    profiler.stopProfiling.mockResolvedValue(undefined)
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
})
