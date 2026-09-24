import type {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyPluginAsync,
  FastifyRequest,
} from 'fastify'
import fp from 'fastify-plugin'
import { isProfilingRunningAfterStart, startProfiling, stopProfiling } from './profiler.ts'
import { resolveProfilingConfigFromEnv, resolveProfilingContextFromEnv } from './profilingConfig.ts'
import type { ProfilingConfig, ProfilingContext, ProfilingLogger } from './types.ts'
import { closeLabelScope, openLabelScope } from './wallLabels.ts'

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

  /**
   * Whether every request labels the profiler's samples with its route, as
   * `span_name`, which is the label `pyroscope-analyze --select` cuts a flame
   * graph by.
   *
   * This is where the route is known. An OpenTelemetry HTTP server span is
   * named after the bare method while the request is being served and only
   * renamed to carry the route once the response has gone out, so the span
   * processor on its own can label a request `POST` but never
   * `POST /v1/content/refresh`.
   *
   * Defaults to whether the profiler is running once the plugin has started it,
   * or, with `start: false`, once the entry point's start has finished. With
   * profiling off the hooks are not registered at all, so a service that is
   * not being profiled pays nothing per request.
   */
  labelRequests?: boolean
}

/**
 * Starts continuous profiling when the app is registered, labels the samples
 * taken during each request with its route, and flushes the last profile window
 * when the app closes.
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

  const running =
    options.start === false
      ? await isProfilingRunningAfterStart()
      : await startProfiling(
          options.config ?? resolveProfilingConfigFromEnv({ appName: options.appName }),
          options.context ?? resolveProfilingContextFromEnv(),
          logger,
        )

  if (options.labelRequests ?? running) registerRequestLabels(app)
}

/**
 * The scope open for a request, held beside the request rather than on it, so
 * that nothing this plugin does shows up in the shape Fastify optimises for.
 */
const scopeByRequest = new WeakMap<FastifyRequest, number>()

/**
 * The route pattern, not the path: `POST /v1/content/:id` is one series across
 * every id, where the raw path would be one per id and no filter anyone could
 * reuse. A request that matched no route keeps the method on its own, which is
 * what an HTTP span is named in the same situation.
 */
const requestLabel = (request: FastifyRequest): string => {
  const route = request.routeOptions.url
  return route ? `${request.method} ${route}` : request.method
}

function registerRequestLabels(app: FastifyInstance): void {
  const release = (request: FastifyRequest): void => {
    const scope = scopeByRequest.get(request)
    if (scope === undefined) return
    scopeByRequest.delete(request)
    try {
      closeLabelScope(scope)
    } catch {
      // The labels are diagnostics. A profiler that refuses them is not a
      // reason to fail a response that has already been sent.
    }
  }

  app.addHook('onRequest', (request, _reply, done) => {
    try {
      const scope = openLabelScope({ span_name: requestLabel(request) })
      if (scope !== undefined) scopeByRequest.set(request, scope)
    } catch {
      // A profiler that refuses labels (the Windows wall profiler does) must
      // not stop the request it was asked to label.
    }
    done()
  })

  app.addHook('onResponse', (request, _reply, done) => {
    release(request)
    done()
  })

  // A client that disconnects mid-request never reaches onResponse, and the
  // scope would then be held until the open-scope bound reclaimed it.
  app.addHook('onRequestAbort', (request, done) => {
    release(request)
    done()
  })
}

export const pyroscopeProfilingPlugin = fp(plugin, {
  fastify: '5.x',
  name: 'pyroscope-profiling-plugin',
})
