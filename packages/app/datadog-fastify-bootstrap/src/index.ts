// dd-trace must be loaded via `--import dd-trace/initialize.mjs` at process start.
// That flag registers the ESM loader hook and creates the singleton tracer.
// We import the singleton here to reconfigure it with user options.
import tracer from 'dd-trace'

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: string
  time: number
  msg: string
  [key: string]: unknown
}

function createLogEntry(level: LogLevel, msg: string, data?: Record<string, unknown>): LogEntry {
  return {
    level,
    time: Date.now(),
    ...data,
    msg,
  }
}

function log(level: LogLevel, msgOrData: string | Record<string, unknown>, msg?: string): void {
  let logEntry: LogEntry
  if (typeof msgOrData === 'string') {
    logEntry = createLogEntry(level, msgOrData)
  } else {
    logEntry = createLogEntry(level, msg ?? '', msgOrData)
  }

  const output = JSON.stringify(logEntry)
  if (level === 'error') {
    // biome-ignore lint/suspicious/noConsole: this is the logger implementation
    console.error(output)
  } else if (level === 'warn') {
    // biome-ignore lint/suspicious/noConsole: this is the logger implementation
    console.warn(output)
  } else {
    // biome-ignore lint/suspicious/noConsole: this is the logger implementation
    console.log(output)
  }
}

const logger = {
  info: (msgOrData: string | Record<string, unknown>, msg?: string) => log('info', msgOrData, msg),
  error: (msgOrData: string | Record<string, unknown>, msg?: string) =>
    log('error', msgOrData, msg),
  warn: (msgOrData: string | Record<string, unknown>, msg?: string) => log('warn', msgOrData, msg),
  debug: (msgOrData: string | Record<string, unknown>, msg?: string) =>
    log('debug', msgOrData, msg),
}

const DEFAULT_SKIPPED_PATHS = ['/health', '/metrics', '/']

export interface DatadogOptions {
  /** Service name reported to Datadog. Maps to DD_SERVICE. */
  service?: string
  /** Environment name (e.g. prod, staging). Maps to DD_ENV. */
  env?: string
  /** Application version. Maps to DD_VERSION. */
  version?: string
  /**
   * Full URL of the Datadog Agent (e.g. `http://dd-agent:8126`).
   * Takes priority over `agentHost` and `agentPort`.
   * Maps to DD_TRACE_AGENT_URL, with OTEL_EXPORTER_URL as fallback.
   */
  url?: string
  /**
   * Datadog Agent hostname. Ignored when `url` is set.
   * @default '127.0.0.1'
   */
  agentHost?: string
  /**
   * Datadog Agent trace port. Ignored when `url` is set.
   * @default 8126
   */
  agentPort?: number
  /**
   * Paths to exclude from tracing.
   * @default ['/health', '/metrics', '/']
   */
  skippedPaths?: string[]
  /**
   * Enable runtime metrics collection. Maps to DD_RUNTIME_METRICS_ENABLED.
   * @default false
   */
  runtimeMetrics?: boolean
  /**
   * Enable continuous profiling. Maps to DD_PROFILING_ENABLED.
   * @default false
   */
  profiling?: boolean
  /**
   * Enable trace ID injection into logs. Maps to DD_LOGS_INJECTION.
   * @default false
   */
  logInjection?: boolean
  /**
   * Global trace sample rate (0 to 1). Maps to DD_TRACE_SAMPLE_RATE.
   */
  sampleRate?: number
  /**
   * Enable debug logging from dd-trace. Maps to DD_TRACE_DEBUG.
   * @default false
   */
  debug?: boolean
  /**
   * Enable dd-trace startup logs.
   * @default true
   */
  startupLogs?: boolean
  /** Additional tags applied to every span and metric. */
  tags?: Record<string, string>
}

let isInitialized = false

/**
 * Reconfigure the dd-trace singleton with application-specific options.
 *
 * Requires `node --import dd-trace/initialize.mjs` to be set at process start,
 * which registers the ESM loader hook and creates the tracer before any
 * application code runs. This function then reconfigures that tracer.
 *
 * @example
 * ```ts
 * import { initDatadog } from '@lokalise/datadog-fastify-bootstrap'
 *
 * initDatadog({ service: 'my-api', env: 'production' })
 * ```
 */
export function initDatadog(options: DatadogOptions = {}): void {
  const {
    service,
    env,
    version,
    url,
    agentHost,
    agentPort,
    skippedPaths = DEFAULT_SKIPPED_PATHS,
    runtimeMetrics = false,
    profiling = false,
    logInjection = false,
    sampleRate,
    debug = false,
    startupLogs = true,
    tags,
  } = options

  // Resolve agent URL: explicit url option > DD_TRACE_AGENT_URL > OTEL_EXPORTER_URL.
  // Only fall back to env vars when neither url nor agentHost/agentPort are explicitly set,
  // to avoid env vars silently overriding explicit connection options.
  const hasExplicitConnection =
    url !== undefined || agentHost !== undefined || agentPort !== undefined
  const resolvedUrl =
    url ??
    (hasExplicitConnection
      ? undefined
      : (process.env.DD_TRACE_AGENT_URL ?? process.env.OTEL_EXPORTER_URL))

  logger.info('[DD] initDatadog called')

  // Support DD_TRACE_ENABLED with OTEL_ENABLED as fallback for migration compatibility
  const enabledEnvVar =
    process.env.DD_TRACE_ENABLED?.toLowerCase() ?? process.env.OTEL_ENABLED?.toLowerCase()
  const isDatadogEnabled = process.env.NODE_ENV !== 'test' && enabledEnvVar === 'true'

  logger.info(
    {
      nodeEnv: process.env.NODE_ENV,
      ddTraceEnabled: process.env.DD_TRACE_ENABLED,
      otelEnabled: process.env.OTEL_ENABLED,
      isDatadogEnabled,
      service,
      env,
      resolvedUrl,
      runtimeMetrics,
      profiling,
      logInjection,
      skippedPaths,
    },
    '[DD] Configuration',
  )

  if (isDatadogEnabled && !isInitialized) {
    logger.info('[DD] Initializing dd-trace...')

    // dd-trace reads DD_TRACE_DEBUG from env; set it before init if requested
    if (debug) {
      process.env.DD_TRACE_DEBUG = 'true'
    }

    tracer.init({
      service,
      env,
      version,
      url: resolvedUrl,
      hostname: agentHost,
      port: agentPort,
      runtimeMetrics,
      profiling,
      logInjection,
      sampleRate,
      startupLogs,
      tags,
      plugins: true,
    })

    tracer.use('http', {
      server: {
        blocklist: skippedPaths,
      },
    })

    isInitialized = true
    logger.info('[DD] dd-trace initialized successfully — ready to send traces')
  } else {
    logger.info('[DD] Datadog tracing is disabled or already initialized')
  }
}

/**
 * Gracefully flush pending traces and shut down the tracer.
 *
 * Call this before process exit (e.g. on SIGTERM) to avoid losing in-flight spans.
 */
export async function gracefulDatadogShutdown(): Promise<void> {
  logger.info('[DD] Shutdown requested')
  if (!isInitialized) {
    logger.info('[DD] Tracer was not initialized, nothing to shutdown')
    return
  }

  const FLUSH_TIMEOUT_MS = 5000
  // Fallback wait matching dd-trace's default flushInterval, used when the
  // internal exporter is unavailable so background exports can still complete.
  const FALLBACK_WAIT_MS = 2000

  let flushed = false

  try {
    // Access the internal exporter defensively — this is an undocumented API
    // that may change across dd-trace versions.
    const internalTracer = (tracer as unknown as Record<string, unknown>)._tracer as
      | Record<string, unknown>
      | undefined
    const exporter = internalTracer?._exporter as { flush?: (done: () => void) => void } | undefined
    const flushFn =
      typeof exporter?.flush === 'function' ? exporter.flush.bind(exporter) : undefined

    if (flushFn) {
      flushed = true
      await new Promise<void>((resolve) => {
        let settled = false

        const timer = setTimeout(() => {
          if (!settled) {
            settled = true
            logger.warn(
              `[DD] Flush timed out after ${FLUSH_TIMEOUT_MS}ms, proceeding with shutdown`,
            )
            resolve()
          }
        }, FLUSH_TIMEOUT_MS).unref()

        try {
          flushFn(() => {
            if (!settled) {
              settled = true
              clearTimeout(timer)
              resolve()
            }
          })
        } catch (flushError) {
          if (!settled) {
            settled = true
            clearTimeout(timer)
            logger.error({ error: flushError }, '[DD] Flush call threw, proceeding with shutdown')
            resolve()
          }
        }
      })
    }
  } catch (error) {
    logger.error({ error }, '[DD] Error accessing internal exporter for flush')
  }

  if (!flushed) {
    logger.info(
      `[DD] Internal exporter not available, waiting ${FALLBACK_WAIT_MS}ms for pending exports`,
    )
    await new Promise<void>((resolve) => {
      setTimeout(resolve, FALLBACK_WAIT_MS).unref()
    })
  }

  isInitialized = false
  logger.info('[DD] Tracer shutdown completed successfully')
}

/**
 * Returns the active dd-trace Tracer instance, or `undefined` if not initialized.
 *
 * Use this to create custom spans:
 * @example
 * ```ts
 * const tracer = getTracer()
 * const span = tracer?.startSpan('my.custom.operation')
 * // ... do work ...
 * span?.finish()
 * ```
 */
export function getTracer(): typeof tracer | undefined {
  return isInitialized ? tracer : undefined
}
