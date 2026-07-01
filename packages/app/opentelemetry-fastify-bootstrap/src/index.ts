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
import {
  assertValidDbNamespaceBySystem,
  DbNamespaceSpanExporter,
} from './dbNamespaceSpanExporter.ts'

export {
  DbNamespaceSpanExporter,
  type DbNamespaceSpanExporterOptions,
} from './dbNamespaceSpanExporter.ts'

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

function resolveDbNamespaceBySystem(
  dbNamespaceBySystem: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> | undefined {
  if (!dbNamespaceBySystem) return undefined
  if (Object.keys(dbNamespaceBySystem).length === 0) {
    logger.warn(
      '[OTEL] dbNamespaceBySystem was provided but contains no entries; db.namespace enrichment will not be enabled',
    )
    return undefined
  }
  // Validate eagerly so a misconfigured mapping throws in every environment
  // (dev, CI), not only at production startup when the exporter is built.
  assertValidDbNamespaceBySystem(dbNamespaceBySystem)
  return dbNamespaceBySystem
}

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

  /**
   * Maps OTel `db.system` values to the `db.namespace` to report for them. When
   * set, the Datadog-bound trace exporter is wrapped so matching outbound DB
   * spans carry `db.namespace` in the export payload, joining them to Datadog's
   * existing inferred-service entity for the cluster. Only the export payload is
   * shaped — the shared span other processors/exporters see is left untouched.
   * See {@link DbNamespaceSpanExporter} for the full mechanics.
   *
   * @example
   * ```ts
   * dbNamespaceBySystem: { elasticsearch: 'lokalise' }
   * ```
   */
  dbNamespaceBySystem?: Readonly<Record<string, string>>
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
    dbNamespaceBySystem,
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
      dbNamespaceSystemsConfigured: dbNamespaceBySystem ? Object.keys(dbNamespaceBySystem) : [],
    },
    '[OTEL] Configuration',
  )

  // Validated outside the enabled gate so a misconfigured mapping throws in
  // every environment (dev, CI) instead of only at production startup.
  const validatedDbNamespaceBySystem = resolveDbNamespaceBySystem(dbNamespaceBySystem)

  if (isOpenTelemetryEnabled && !isInstrumentationRegistered) {
    logger.info('[OTEL] Initializing OpenTelemetry SDK...')
    // Configure the OTLP trace exporter
    const exporterUrl = process.env.OTEL_EXPORTER_URL || 'grpc://localhost:4317'
    logger.info({ exporterUrl }, '[OTEL] Configuring trace exporter')

    const otlpExporter = new OTLPTraceExporterGrpc({
      // optional - url default value is http://localhost:4318/v1/traces (http)
      // or grpc://localhost:4317/opentelemetry.proto.collector.trace.v1.TraceService/Export (grpc)
      url: exporterUrl,
    })

    // Wrap ONLY the Datadog-bound exporter: db.namespace is added to its export
    // payload, not to the shared span, so console/user processors and any other
    // exporter still see the unmodified span. No ordering constraints — the
    // transform happens entirely inside this exporter's own export().
    const traceExporter = validatedDbNamespaceBySystem
      ? new DbNamespaceSpanExporter(otlpExporter, {
          dbNamespaceBySystem: validatedDbNamespaceBySystem,
        })
      : otlpExporter

    const allSpanProcessors: SpanProcessor[] = [
      new BatchSpanProcessor(traceExporter),
      ...spanProcessors,
    ]

    if (consoleSpans) {
      allSpanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()))
    }

    // auto-instrumentations-node no longer bundles a fastify instrumentation
    // since v0.76.0 — @fastify/otel below is the sole fastify instrumentation.
    sdk = new NodeSDK({
      spanProcessors: allSpanProcessors,
      instrumentations: [
        getNodeAutoInstrumentations(),
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
