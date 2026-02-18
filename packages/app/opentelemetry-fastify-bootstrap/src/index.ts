import { FastifyOtelInstrumentation } from '@fastify/otel'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter as OTLPTraceExporterGrpc } from '@opentelemetry/exporter-trace-otlp-grpc'
import { NodeSDK } from '@opentelemetry/sdk-node'
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base'

// Call initOpenTelemetry() before starting the server.
// The application must be started with --import=@opentelemetry/instrumentation/hook.mjs

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

  /**
   * Enable console span exporter for debugging purposes.
   * When enabled, spans will be printed to the console in addition to the OTLP exporter.
   * @default false
   */
  consoleSpans?: boolean

  /**
   * Additional span processors to register with the OpenTelemetry SDK.
   */
  spanProcessors?: SpanProcessor[]
}

let isInstrumentationRegistered = false
let sdk: NodeSDK | undefined

/**
 * Initialize OpenTelemetry instrumentation.
 *
 * The application must be started with the `--import=@opentelemetry/instrumentation/hook.mjs`
 * Node.js flag to enable automatic module patching. When using this flag, strict import
 * sequencing is not required — regular static imports are recommended for better performance.
 *
 * Call this function before starting the server.
 *
 * @example
 * ```ts
 * import { initOpenTelemetry } from '@lokalise/opentelemetry-fastify-bootstrap'
 * import { startServer } from './serverInternal.ts'
 *
 * initOpenTelemetry({ skippedPaths: ['/health', '/ready', '/live'] })
 * await startServer()
 * ```
 */
export function initOpenTelemetry(options: OpenTelemetryOptions = {}): void {
  const {
    skippedPaths = DEFAULT_SKIPPED_PATHS,
    consoleSpans = false,
    spanProcessors = [],
  } = options

  logger.info('[OTEL] initOpenTelemetry called')

  const isOpenTelemetryEnabled =
    process.env.NODE_ENV !== 'test' && process.env.OTEL_ENABLED?.toLowerCase() === 'true'

  logger.info(
    {
      nodeEnv: process.env.NODE_ENV,
      openTelemetryEnabled: process.env.OTEL_ENABLED,
      isOpenTelemetryEnabled,
      skippedPaths,
      consoleSpans,
      additionalSpanProcessorsCount: spanProcessors.length,
    },
    '[OTEL] Configuration',
  )

  if (isOpenTelemetryEnabled && !isInstrumentationRegistered) {
    logger.info('[OTEL] Initializing OpenTelemetry SDK...')
    // Configure the OTLP trace exporter
    const exporterUrl = process.env.OTEL_EXPORTER_URL || 'grpc://localhost:4317'
    logger.info({ exporterUrl }, '[OTEL] Configuring trace exporter')

    const traceExporter = new OTLPTraceExporterGrpc({
      // optional - url default value is http://localhost:4318/v1/traces (http)
      // or grpc://localhost:4317/opentelemetry.proto.collector.trace.v1.TraceService/Export (grpc)
      url: exporterUrl,
    })

    const allSpanProcessors: SpanProcessor[] = [
      new BatchSpanProcessor(traceExporter),
      ...spanProcessors,
    ]

    if (consoleSpans) {
      allSpanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()))
    }

    // Setup SDK
    sdk = new NodeSDK({
      spanProcessors: allSpanProcessors,
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
            // Extract path without query string, normalize empty to '/'
            const path = req.url.split('?')[0] || '/'
            return skippedPaths.includes(path)
          },
        }),
      ],
    })

    sdk.start()
    isInstrumentationRegistered = true
    if (consoleSpans) {
      logger.info('[OTEL] Console span exporter enabled for debugging')
    }
    if (spanProcessors.length > 0) {
      logger.info({ count: spanProcessors.length }, '[OTEL] Additional span processors registered')
    }
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
