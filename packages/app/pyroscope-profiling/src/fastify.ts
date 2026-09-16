import type { FastifyBaseLogger, FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { startProfiling, stopProfiling } from './profiler.ts'
import { resolveProfilingConfigFromEnv, resolveProfilingContextFromEnv } from './profilingConfig.ts'
import type { ProfilingConfig, ProfilingContext, ProfilingLogger } from './types.ts'

export type PyroscopeProfilingPluginOptions = {
  /**
   * Where to ship profiles. Defaults to
   * `resolveProfilingConfigFromEnv({ appName })`, so an app that configures
   * itself from `PYROSCOPE_*` only needs `appName`.
   */
  config?: ProfilingConfig

  /**
   * Name to file profiles under when `config` is omitted and
   * `PYROSCOPE_APPLICATION_NAME` is unset. Pass the service name.
   */
  appName?: string

  /**
   * Labels attached to every profile. Defaults to
   * `resolveProfilingContextFromEnv()`, which reads `APP_ENV`, `APP_VERSION`
   * and `GIT_COMMIT_SHA`.
   */
  context?: ProfilingContext

  /** Defaults to `app.log`. */
  logger?: ProfilingLogger

  /**
   * Whether the plugin starts the profiler. Set it to `false` when the entry
   * point already called `startProfiling`, which is what gets startup into the
   * first profile window: a plugin cannot run before the app it is registered
   * on exists. The `onClose` flush is registered either way, so the plugin is
   * still worth registering with this off.
   *
   * @default true
   */
  start?: boolean
}

/**
 * Starts continuous profiling when the app is registered and flushes the last
 * profile window when it closes.
 *
 * Off unless `PYROSCOPE_ENABLED` is `true` (or the `config` passed says so), and
 * every failure inside it is logged and swallowed: a profiler that cannot reach
 * its server is not a reason to refuse to serve traffic.
 *
 * @example
 * ```ts
 * import { pyroscopeProfilingPlugin } from '@lokalise/pyroscope-profiling/fastify'
 *
 * await app.register(pyroscopeProfilingPlugin, { appName: 'my-service' })
 * ```
 */
const plugin: FastifyPluginAsync<PyroscopeProfilingPluginOptions> = async (
  app: FastifyInstance,
  options: PyroscopeProfilingPluginOptions,
) => {
  const logger: ProfilingLogger = options.logger ?? (app.log as FastifyBaseLogger)

  // Registered before the start below, and unconditionally: a start that failed
  // leaves nothing to flush, and `stopProfiling` is a no-op in that case.
  app.addHook('onClose', async () => {
    await stopProfiling(logger)
  })

  if (options.start === false) return

  const config = options.config ?? resolveProfilingConfigFromEnv({ appName: options.appName ?? '' })
  const context = options.context ?? resolveProfilingContextFromEnv()

  await startProfiling(config, context, logger)
}

export const pyroscopeProfilingPlugin = fp(plugin, {
  fastify: '5.x',
  name: 'pyroscope-profiling-plugin',
})

export type { ProfilingConfig, ProfilingContext, ProfilingLogger } from './types.ts'
