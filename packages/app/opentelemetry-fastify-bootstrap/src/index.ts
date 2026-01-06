import { FastifyOtelInstrumentation } from '@fastify/otel'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter as OTLPTraceExporterGrpc } from '@opentelemetry/exporter-trace-otlp-grpc'
import { NodeSDK } from '@opentelemetry/sdk-node'

// This needs to be imported and run before any other code in your app

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

export interface OpenTelemetryOptions {
  /**
   * Paths to exclude from tracing.
   * @default ['/health', '/metrics', '/']
   */
  skippedPaths?: string[]
}

let isInstrumentationRegistered = false
let sdk: NodeSDK | undefined

/**
 * Initialize OpenTelemetry instrumentation.
 *
 * IMPORTANT: This function must be called BEFORE importing any other modules
 * that you want to instrument (fastify, http, etc.).
 *
 * @example
 * ```ts
 * // At the very top of your entry point
 * import { initOpenTelemetry } from '@lokalise/opentelemetry-fastify-bootstrap'
 * initOpenTelemetry({ skippedPaths: ['/health', '/ready', '/live'] })
 *
 * // Only import other modules AFTER initialization
 * import fastify from 'fastify'
 * ```
 */
export function initOpenTelemetry(options: OpenTelemetryOptions = {}): void {
  const { skippedPaths = DEFAULT_SKIPPED_PATHS } = options

  logger.info('[OTEL] initOpenTelemetry called')

  const isOpenTelemetryEnabled =
    process.env.NODE_ENV !== 'test' && process.env.OPEN_TELEMETRY_ENABLED?.toLowerCase() === 'true'

  logger.info(
    {
      nodeEnv: process.env.NODE_ENV,
      openTelemetryEnabled: process.env.OPEN_TELEMETRY_ENABLED,
      isOpenTelemetryEnabled,
      skippedPaths,
    },
    '[OTEL] Configuration',
  )

  if (isOpenTelemetryEnabled && !isInstrumentationRegistered) {
    logger.info('[OTEL] Initializing OpenTelemetry SDK...')
    // Configure the OTLP trace exporter
    const exporterUrl = process.env.OPEN_TELEMETRY_EXPORTER_URL || 'grpc://localhost:4317'
    logger.info({ exporterUrl }, '[OTEL] Configuring trace exporter')

    const traceExporter = new OTLPTraceExporterGrpc({
      // optional - url default value is http://localhost:4318/v1/traces (http)
      // or grpc://localhost:4317/opentelemetry.proto.collector.trace.v1.TraceService/Export (grpc)
      url: exporterUrl,
    })

    // Setup SDK
    sdk = new NodeSDK({
      traceExporter,
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fastify': {
            enabled: false,
          },
        }),
        new FastifyOtelInstrumentation({
          registerOnInitialization: true,
          ignorePaths: (req) => {
            if (!req.url) return false
            // Ignore path and query string, if needed
            const path = req.url.split('?')[0]
            // biome-ignore lint/style/noNonNullAssertion: there will always be some path
            return skippedPaths.includes(path!)
          },
        }),
      ],
    })

    sdk.start()
    isInstrumentationRegistered = true
    logger.info('[OTEL] SDK started successfully - ready to send traces')
  } else {
    logger.info('[OTEL] OpenTelemetry is disabled or already registered')
  }
}

export async function gracefulOtelShutdown(): Promise<void> {
  logger.info('[OTEL] Shutdown requested')
  if (!sdk) {
    logger.info('[OTEL] No SDK instance to shutdown')
    return
  }
  try {
    await sdk.shutdown()
    isInstrumentationRegistered = false
    logger.info('[OTEL] SDK shutdown completed successfully')
  } catch (error) {
    logger.error({ error }, '[OTEL] Error during SDK shutdown')
  }
}
