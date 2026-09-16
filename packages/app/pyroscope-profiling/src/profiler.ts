import { hostname } from 'node:os'
import type { ProfilingConfig, ProfilingContext, ProfilingLogger } from './types.ts'

type PyroscopeModule = typeof import('@pyroscope/nodejs')

/**
 * How long a shutdown waits for the final profile to reach the ingest endpoint.
 *
 * Pyroscope's exporter posts with `fetch` and no timeout, and swallows its own
 * errors, so an ingest host that accepts the connection and then goes quiet
 * would hold `app.close()` open until the platform kills the process. Losing
 * the last profile window is the cheaper outcome.
 */
const STOP_TIMEOUT_MS = 5_000

/**
 * The characters Pyroscope rejects in an app name or a label. It encodes both
 * into one string (`appName{key=value,key=value}`), so all four are structural,
 * and `init()` throws when it finds one. An `APP_VERSION` that happened to
 * carry a comma would otherwise take the service down at startup over a
 * profiler label.
 */
const INVALID_LABEL_CHARACTERS = /[{},=]/g

/** Set while profiling is running; the module reference doubles as the flag. */
let running: PyroscopeModule | undefined

/**
 * The SDK, while it is profiling, for the callers that need to reach it from
 * outside: the span processor labels the profiler's samples with the span they
 * were taken under, and it is constructed before {@link startProfiling} has run
 * and has to work when it never does.
 */
export function runningProfiler(): PyroscopeModule | undefined {
  return running
}

/** Whether {@link startProfiling} succeeded and {@link stopProfiling} has not run yet. */
export function isProfilingRunning(): boolean {
  return running !== undefined
}

const toLabelValue = (value: string): string => value.replace(INVALID_LABEL_CHARACTERS, '_')

/**
 * Drops the build timestamp Lokalise's `APP_VERSION` carries (`1.2.3@1700000000`),
 * so that two pods of the same release share one `version` label instead of
 * splitting the flame graph by build minute.
 */
const toVersionLabel = (appVersion: string): string => appVersion.split('@')[0] ?? appVersion

const buildTags = (context: ProfilingContext): Record<string, string> => {
  const raw: Record<string, string> = {
    // Per-pod label: it is what separates one instance's flame graph from the
    // aggregate when a single replica is the one burning CPU.
    instance: context.instance ?? hostname(),
  }
  if (context.appEnv) raw.env = context.appEnv
  if (context.appVersion) raw.version = toVersionLabel(context.appVersion)
  if (context.gitCommitSha) raw.commit_sha = context.gitCommitSha
  Object.assign(raw, context.tags)

  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [toLabelValue(key), toLabelValue(value)]),
  )
}

/**
 * Starts continuous wall-clock and heap profiling and ships the profiles to
 * Pyroscope.
 *
 * The SDK is imported lazily: it loads a native binding (`@datadog/pprof`), and
 * a process that runs without profiling should neither pay for that nor depend
 * on it being loadable for its platform. Every failure is logged and swallowed,
 * because a profiler that cannot reach its server is not a reason to refuse to
 * serve traffic.
 *
 * Call it as early in the entry point as the configuration allows, so the first
 * profile window covers startup, and pair it with {@link stopProfiling} on
 * shutdown. The Fastify plugin (`@lokalise/pyroscope-profiling/fastify`) does
 * both for you.
 *
 * @returns whether profiling is now running.
 */
export async function startProfiling(
  config: ProfilingConfig,
  context: ProfilingContext,
  logger: ProfilingLogger,
): Promise<boolean> {
  if (!config.isEnabled) return false
  if (running) {
    logger.warn('[PYROSCOPE] Profiling is already running')
    return true
  }
  if (!config.appName) {
    logger.error(
      '[PYROSCOPE] Profiling is enabled but no application name is set, refusing to start. Set PYROSCOPE_APPLICATION_NAME or pass appName',
    )
    return false
  }

  const appName = toLabelValue(config.appName)
  const tags = buildTags(context)

  try {
    const pyroscope = await import('@pyroscope/nodejs')
    // Routes the profiler's own diagnostics (`@datadog/pprof` internals and the
    // source mapper) into the app logger instead of nowhere. It does not cover
    // the exporter: rejected and failed ingests are logged through `debug`, so
    // seeing those needs DEBUG=pyroscope* (see the README, "When no profiles
    // arrive").
    pyroscope.default.setLogger(logger)
    pyroscope.init({
      appName,
      serverAddress: config.serverAddress,
      authToken: config.authToken,
      basicAuthUser: config.basicAuthUser,
      basicAuthPassword: config.basicAuthPassword,
      tenantID: config.tenantId,
      tags,
    })
    pyroscope.start()
    running = pyroscope
    logger.info(
      { appName, serverAddress: config.serverAddress, tags },
      '[PYROSCOPE] Continuous profiling started',
    )
    return true
  } catch (error) {
    logger.error({ error }, '[PYROSCOPE] Failed to start continuous profiling')
    return false
  }
}

/**
 * Stops profiling and flushes the profile collected since the last interval.
 * A no-op when profiling was never started, which is every test run and every
 * environment that leaves `PYROSCOPE_ENABLED` off.
 */
export async function stopProfiling(logger: ProfilingLogger): Promise<void> {
  const pyroscope = running
  if (!pyroscope) return
  running = undefined

  let timer: NodeJS.Timeout | undefined
  try {
    const flushed = await Promise.race([
      pyroscope.stop().then(() => true),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), STOP_TIMEOUT_MS)
      }),
    ])
    if (flushed) {
      logger.info('[PYROSCOPE] Continuous profiling stopped')
    } else {
      logger.warn(
        { timeoutMs: STOP_TIMEOUT_MS },
        '[PYROSCOPE] Timed out flushing the last profile, continuing shutdown',
      )
    }
  } catch (error) {
    logger.error({ error }, '[PYROSCOPE] Failed to stop continuous profiling cleanly')
  } finally {
    clearTimeout(timer)
  }
}
