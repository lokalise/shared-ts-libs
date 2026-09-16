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
 * A start that has not finished yet, so that a second caller joins it instead
 * of running its own. An entry point and the Fastify plugin both reach
 * `startProfiling` and neither awaits the other: without this the two would
 * both pass the `running` check while the first was still awaiting the SDK
 * import, and the second `init()` would replace the SDK's global profiler while
 * the first one kept sampling, exporting and holding the event loop open, with
 * nothing left able to stop it.
 */
let starting: Promise<boolean> | undefined

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
 * splitting the flame graph by build minute. A value that is nothing but a
 * timestamp keeps it, because an empty label value is a filter nobody can use.
 */
const toVersionLabel = (appVersion: string): string =>
  appVersion.split('@')[0]?.trim() || appVersion.trim()

const buildTags = (context: ProfilingContext): Record<string, string> => {
  const raw: Record<string, string> = {
    // Per-pod label: it is what separates one instance's flame graph from the
    // aggregate when a single replica is the one burning CPU.
    instance: context.instance ?? hostname(),
  }
  if (context.appEnv) raw.env = context.appEnv
  if (context.appVersion) {
    const version = toVersionLabel(context.appVersion)
    if (version) raw.version = version
  }
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
  if (starting) {
    logger.warn('[PYROSCOPE] Profiling is already starting')
    return await starting
  }
  if (!config.appName) {
    logger.error(
      '[PYROSCOPE] Profiling is enabled but no application name is set, refusing to start. Set PYROSCOPE_APPLICATION_NAME or pass appName',
    )
    return false
  }

  starting = startSdk(config, context, logger)
  try {
    return await starting
  } finally {
    starting = undefined
  }
}

async function startSdk(
  config: ProfilingConfig,
  context: ProfilingContext,
  logger: ProfilingLogger,
): Promise<boolean> {
  const appName = toLabelValue(config.appName)
  const tags = buildTags(context)

  let pyroscope: PyroscopeModule | undefined
  try {
    pyroscope = await import('@pyroscope/nodejs')
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
    await rollBackPartialStart(pyroscope, logger)
    return false
  }
}

/**
 * `start()` starts the wall profiler and then the heap one, so a failure in the
 * second leaves the first sampling, exporting and holding the event loop open,
 * with `running` unset and therefore nothing left that could stop it. Stopping
 * a profiler that never started throws, which is the expected outcome here
 * rather than a problem.
 */
async function rollBackPartialStart(
  pyroscope: PyroscopeModule | undefined,
  logger: ProfilingLogger,
): Promise<void> {
  if (!pyroscope) return
  try {
    await stopWithTimeout(pyroscope)
  } catch (error) {
    logger.debug({ error }, '[PYROSCOPE] Nothing to roll back after a failed start')
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

  try {
    if (await stopWithTimeout(pyroscope)) {
      logger.info('[PYROSCOPE] Continuous profiling stopped')
    } else {
      logger.warn(
        { timeoutMs: STOP_TIMEOUT_MS },
        '[PYROSCOPE] Timed out flushing the last profile, continuing shutdown',
      )
    }
  } catch (error) {
    logger.error({ error }, '[PYROSCOPE] Failed to stop continuous profiling cleanly')
  }
}

/** Whether the final flush made it out before {@link STOP_TIMEOUT_MS}. */
async function stopWithTimeout(pyroscope: PyroscopeModule): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      pyroscope.stop().then(() => true),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), STOP_TIMEOUT_MS)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
