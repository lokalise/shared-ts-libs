import { hostname } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProfilingConfig, ProfilingContext, ProfilingLogger } from './types.ts'

const pyroscopeMock = vi.hoisted(() => ({
  init: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  setLogger: vi.fn(),
}))

vi.mock('@pyroscope/nodejs', () => ({
  default: { setLogger: pyroscopeMock.setLogger },
  init: pyroscopeMock.init,
  start: pyroscopeMock.start,
  stop: pyroscopeMock.stop,
}))

const ENABLED_CONFIG: ProfilingConfig = {
  isEnabled: true,
  appName: 'my-service',
  serverAddress: 'http://pyroscope.test:4040',
  authToken: 'token',
  basicAuthUser: 'instance-id',
  basicAuthPassword: 'secret',
  tenantId: 'lokalise',
}

const CONTEXT: ProfilingContext = {
  appEnv: 'staging',
  appVersion: '1.2.3@1700000000',
  gitCommitSha: 'abc123',
}

const buildLogger = () =>
  ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  }) as unknown as ProfilingLogger

/**
 * The module tracks whether profiling is running in module scope, so every test
 * gets its own instance instead of inheriting the previous one's state.
 */
const loadModule = () => {
  vi.resetModules()
  return import('./profiler.ts')
}

describe('profiler', () => {
  let logger: ProfilingLogger

  beforeEach(() => {
    vi.clearAllMocks()
    pyroscopeMock.stop.mockResolvedValue(undefined)
    logger = buildLogger()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('startProfiling', () => {
    it('does not load the SDK when profiling is disabled', async () => {
      const { startProfiling } = await loadModule()

      const started = await startProfiling({ ...ENABLED_CONFIG, isEnabled: false }, CONTEXT, logger)

      expect(started).toBe(false)
      expect(pyroscopeMock.init).not.toHaveBeenCalled()
      expect(pyroscopeMock.start).not.toHaveBeenCalled()
    })

    it('initializes the SDK with the configured endpoint and credentials', async () => {
      const { startProfiling, isProfilingRunning } = await loadModule()

      const started = await startProfiling(ENABLED_CONFIG, CONTEXT, logger)

      expect(started).toBe(true)
      expect(isProfilingRunning()).toBe(true)
      expect(pyroscopeMock.init).toHaveBeenCalledWith(
        expect.objectContaining({
          appName: 'my-service',
          serverAddress: 'http://pyroscope.test:4040',
          authToken: 'token',
          basicAuthUser: 'instance-id',
          basicAuthPassword: 'secret',
          tenantID: 'lokalise',
        }),
      )
      expect(pyroscopeMock.start).toHaveBeenCalledOnce()
      expect(pyroscopeMock.setLogger).toHaveBeenCalledWith(logger)
    })

    it('tags profiles with the instance identity, without the version timestamp', async () => {
      const { startProfiling } = await loadModule()

      await startProfiling(ENABLED_CONFIG, CONTEXT, logger)

      expect(pyroscopeMock.init).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: {
            env: 'staging',
            version: '1.2.3',
            commit_sha: 'abc123',
            instance: hostname(),
          },
        }),
      )
    })

    it('leaves out labels the context does not carry', async () => {
      const { startProfiling } = await loadModule()

      await startProfiling(ENABLED_CONFIG, { appEnv: 'production' }, logger)

      expect(pyroscopeMock.init).toHaveBeenCalledWith(
        expect.objectContaining({ tags: { env: 'production', instance: hostname() } }),
      )
    })

    it('adds custom labels and lets them replace the defaults', async () => {
      const { startProfiling } = await loadModule()

      await startProfiling(
        ENABLED_CONFIG,
        { ...CONTEXT, instance: 'pod-7', tags: { region: 'eu-west-1', env: 'canary' } },
        logger,
      )

      expect(pyroscopeMock.init).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: {
            env: 'canary',
            version: '1.2.3',
            commit_sha: 'abc123',
            instance: 'pod-7',
            region: 'eu-west-1',
          },
        }),
      )
    })

    it('replaces the characters Pyroscope rejects in an app name or a label', async () => {
      const { startProfiling } = await loadModule()

      await startProfiling(
        { ...ENABLED_CONFIG, appName: 'my{service}' },
        { ...CONTEXT, appVersion: 'v1{2}=3,4@1700000000', tags: { 'a=b': 'c,d' } },
        logger,
      )

      expect(pyroscopeMock.init).toHaveBeenCalledWith(
        expect.objectContaining({
          appName: 'my_service_',
          tags: expect.objectContaining({ version: 'v1_2__3_4', a_b: 'c_d' }),
        }),
      )
    })

    // Lokalise's APP_VERSION is `1.2.3@1700000000`, and a build that only ever
    // set the timestamp half would otherwise be filed under `version=`, which
    // is a label nobody can filter on.
    it('keeps a version that is nothing but a build timestamp, and drops a blank one', async () => {
      const { startProfiling } = await loadModule()

      await startProfiling(ENABLED_CONFIG, { appVersion: '@1700000000' }, logger)
      expect(pyroscopeMock.init).toHaveBeenCalledWith(
        expect.objectContaining({ tags: { version: '@1700000000', instance: hostname() } }),
      )

      const { startProfiling: startAgain } = await loadModule()
      pyroscopeMock.init.mockClear()
      await startAgain(ENABLED_CONFIG, { appVersion: '   ' }, logger)
      expect(pyroscopeMock.init).toHaveBeenCalledWith(
        expect.objectContaining({ tags: { instance: hostname() } }),
      )
    })

    it('refuses to start without an app name rather than filing profiles under an empty one', async () => {
      const { startProfiling } = await loadModule()

      const started = await startProfiling({ ...ENABLED_CONFIG, appName: '' }, CONTEXT, logger)

      expect(started).toBe(false)
      expect(pyroscopeMock.init).not.toHaveBeenCalled()
      expect(logger.error).toHaveBeenCalled()
    })

    it('does not start twice', async () => {
      const { startProfiling } = await loadModule()

      await startProfiling(ENABLED_CONFIG, CONTEXT, logger)
      const started = await startProfiling(ENABLED_CONFIG, CONTEXT, logger)

      expect(started).toBe(true)
      expect(pyroscopeMock.start).toHaveBeenCalledOnce()
      expect(logger.warn).toHaveBeenCalledWith('[PYROSCOPE] Profiling is already running')
    })

    // An entry point and the Fastify plugin both call this, and neither awaits
    // the other. Two `init()` calls would replace the SDK's global profiler
    // while the first one kept sampling, exporting and holding the event loop
    // open, with nothing left able to stop it.
    it('starts once when two callers race the SDK import', async () => {
      const { startProfiling, isProfilingRunning } = await loadModule()

      const [first, second] = await Promise.all([
        startProfiling(ENABLED_CONFIG, CONTEXT, logger),
        startProfiling(ENABLED_CONFIG, CONTEXT, logger),
      ])

      expect(first).toBe(true)
      expect(second).toBe(true)
      expect(isProfilingRunning()).toBe(true)
      expect(pyroscopeMock.init).toHaveBeenCalledOnce()
      expect(pyroscopeMock.start).toHaveBeenCalledOnce()
      expect(logger.warn).toHaveBeenCalledWith('[PYROSCOPE] Profiling is already starting')
    })

    it('keeps serving when the SDK refuses the configuration', async () => {
      pyroscopeMock.init.mockImplementationOnce(() => {
        throw new Error('Invalid config')
      })
      const { startProfiling, stopProfiling, isProfilingRunning } = await loadModule()

      const started = await startProfiling(ENABLED_CONFIG, CONTEXT, logger)

      expect(started).toBe(false)
      expect(isProfilingRunning()).toBe(false)
      expect(pyroscopeMock.start).not.toHaveBeenCalled()
      expect(logger.error).toHaveBeenCalled()

      // The failed start rolled itself back, and left no second stop behind for
      // the shutdown hook.
      expect(pyroscopeMock.stop).toHaveBeenCalledOnce()
      await stopProfiling(logger)
      expect(pyroscopeMock.stop).toHaveBeenCalledOnce()
    })

    // `start()` is the wall profiler and then the heap one. A failure in the
    // second leaves the first sampling and exporting, with `running` unset and
    // therefore no way left to reach it.
    it('stops a half-started SDK instead of leaving it exporting', async () => {
      pyroscopeMock.start.mockImplementationOnce(() => {
        throw new Error('Heap profiler is already started')
      })
      const { startProfiling, isProfilingRunning } = await loadModule()

      const started = await startProfiling(ENABLED_CONFIG, CONTEXT, logger)

      expect(started).toBe(false)
      expect(isProfilingRunning()).toBe(false)
      expect(pyroscopeMock.stop).toHaveBeenCalledOnce()
      expect(logger.error).toHaveBeenCalled()
    })

    // A tag name that is not `[a-zA-Z_][a-zA-Z0-9_]*` gets the whole series
    // rejected at ingest, and the exporter swallows that, so the service would
    // log a clean start and never land a profile.
    it('sanitizes a tag name into one Pyroscope will keep', async () => {
      const { startProfiling } = await loadModule()

      await startProfiling(
        ENABLED_CONFIG,
        { tags: { 'service.name': 'checkout', 'region-id': 'eu-west-1', '2nd': 'shard' } },
        logger,
      )

      expect(pyroscopeMock.init).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: expect.objectContaining({
            service_name: 'checkout',
            region_id: 'eu-west-1',
            _2nd: 'shard',
          }),
        }),
      )
    })

    it('says so when two tags sanitize onto one label name', async () => {
      const { startProfiling } = await loadModule()

      await startProfiling(ENABLED_CONFIG, { tags: { 'a.b': 'first', 'a-b': 'second' } }, logger)

      expect(logger.warn).toHaveBeenCalledWith(
        { tag: 'a-b', label: 'a_b' },
        '[PYROSCOPE] Two tags sanitize to one label name, keeping the last',
      )
      expect(pyroscopeMock.init).toHaveBeenCalledWith(
        expect.objectContaining({ tags: expect.objectContaining({ a_b: 'second' }) }),
      )
    })

    // `isProfilingRunning` gating the label scopes and the shutdown flush, a
    // profiler reported as running after a rollback would hand a stopped SDK
    // to both.
    it('reports nothing running when the start log throws over the SDK that came up', async () => {
      const failing = buildLogger()
      ;(failing.info as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('logger already destroyed')
      })
      const { startProfiling, isProfilingRunning } = await loadModule()

      await expect(startProfiling(ENABLED_CONFIG, CONTEXT, failing)).resolves.toBe(false)

      expect(isProfilingRunning()).toBe(false)
      expect(pyroscopeMock.stop).toHaveBeenCalledOnce()
    })

    it('keeps serving when even the rollback fails', async () => {
      pyroscopeMock.start.mockImplementationOnce(() => {
        throw new Error('Contexts are not supported')
      })
      pyroscopeMock.stop.mockRejectedValueOnce(new Error('Wall profiler is not started'))
      const { startProfiling } = await loadModule()

      await expect(startProfiling(ENABLED_CONFIG, CONTEXT, logger)).resolves.toBe(false)

      expect(logger.debug).toHaveBeenCalled()
    })
  })

  describe('stopProfiling', () => {
    it('is a no-op when profiling never started', async () => {
      const { stopProfiling } = await loadModule()

      await stopProfiling(logger)

      expect(pyroscopeMock.stop).not.toHaveBeenCalled()
    })

    // An entry point that does not await its own start, or a shutdown that
    // lands while the plugin is still inside the SDK import. Returning here
    // would leave the start to finish into a profiler that keeps sampling and
    // holding the event loop open, with nothing left able to reach it.
    it('waits for a start that is still in flight', async () => {
      const { startProfiling, stopProfiling, isProfilingRunning } = await loadModule()

      const starting = startProfiling(ENABLED_CONFIG, CONTEXT, logger)
      await stopProfiling(logger)

      await expect(starting).resolves.toBe(true)
      expect(isProfilingRunning()).toBe(false)
      expect(pyroscopeMock.stop).toHaveBeenCalledOnce()
    })

    it('flushes the last profile once', async () => {
      const { startProfiling, stopProfiling, isProfilingRunning } = await loadModule()
      await startProfiling(ENABLED_CONFIG, CONTEXT, logger)

      await stopProfiling(logger)
      await stopProfiling(logger)

      expect(pyroscopeMock.stop).toHaveBeenCalledOnce()
      expect(isProfilingRunning()).toBe(false)
      expect(logger.info).toHaveBeenCalledWith('[PYROSCOPE] Continuous profiling stopped')
    })

    it('gives up on a flush that never returns', async () => {
      pyroscopeMock.stop.mockReturnValue(new Promise(() => {}))
      const { startProfiling, stopProfiling } = await loadModule()
      await startProfiling(ENABLED_CONFIG, CONTEXT, logger)

      vi.useFakeTimers()
      const stopped = stopProfiling(logger)
      await vi.advanceTimersByTimeAsync(5_000)
      await stopped

      expect(logger.warn).toHaveBeenCalledWith(
        { timeoutMs: 5_000 },
        '[PYROSCOPE] Timed out flushing the last profile, continuing shutdown',
      )
    })

    it('swallows a failing flush', async () => {
      pyroscopeMock.stop.mockRejectedValue(new Error('ingest unreachable'))
      const { startProfiling, stopProfiling } = await loadModule()
      await startProfiling(ENABLED_CONFIG, CONTEXT, logger)

      await expect(stopProfiling(logger)).resolves.toBeUndefined()

      expect(logger.error).toHaveBeenCalled()
    })
  })

  describe('runningProfiler', () => {
    it('is undefined until a start succeeds, and again after a stop', async () => {
      const { startProfiling, stopProfiling, runningProfiler } = await loadModule()

      expect(runningProfiler()).toBeUndefined()

      await startProfiling(ENABLED_CONFIG, CONTEXT, logger)
      expect(runningProfiler()).toBeDefined()

      await stopProfiling(logger)
      expect(runningProfiler()).toBeUndefined()
    })
  })
})
