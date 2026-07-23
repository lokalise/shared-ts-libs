import { FastifyOtelInstrumentation } from '@fastify/otel'
import type { Span } from '@opentelemetry/api'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter as OTLPTraceExporterGrpc } from '@opentelemetry/exporter-trace-otlp-grpc'
import { NodeSDK } from '@opentelemetry/sdk-node'
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  type SpanExporter,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base'
import type { FastifyRequest } from 'fastify'
import {
  assertValidDbNamespaceBySystem,
  DbNamespaceSpanExporter,
} from './dbNamespaceSpanExporter.ts'
import {
  STREAM_ENDPOINT_SPAN_ATTRIBUTE,
  StreamSpanFilteringExporter,
} from './streamSpanFilteringExporter.ts'

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

/**
 * Marks the request's HTTP server span as a streaming/SSE endpoint when the
 * client negotiated SSE via `Accept: text/event-stream`. Runs as the
 * FastifyOtel `requestHook`, so the span already exists; the marker is later
 * consumed by {@link StreamSpanFilteringExporter} to drop the span before it is
 * exported. Browser `EventSource` clients are required to send this header, and
 * it is the same signal SSE content-negotiation keys on.
 */
const markStreamEndpointSpan = (span: Span, request: FastifyRequest): void => {
  const accept = request.headers.accept
  if (typeof accept === 'string' && accept.includes('text/event-stream')) {
    span.setAttribute(STREAM_ENDPOINT_SPAN_ATTRIBUTE, true)
  }
}

/**
 * Builds the Fastify OpenTelemetry instrumentation.
 */
const createFastifyOtelInstrumentation = (
  skippedPaths: string[],
  skipStreamEndpoints: boolean,
): FastifyOtelInstrumentation =>
  new FastifyOtelInstrumentation({
    registerOnInitialization: true,
    ignorePaths: (req) => {
      if (!req.url) return false
      // Extract path without query string, normalize empty to '/'
      const path = req.url.split('?')[0] || '/'
      return skippedPaths.includes(path)
    },
    requestHook: skipStreamEndpoints ? markStreamEndpointSpan : undefined,
  })

/**
 * Builds the OTLP trace exporter, optionally wrapped to add `db.namespace`
 * and/or to drop streaming/SSE spans. Extracted from {@link initOpenTelemetry}
 * to keep its cognitive complexity in check. Each wrapper shapes only its own
 * export payload, leaving the shared span (seen by console / user span
 * processors) untouched.
 */
const buildTraceExporter = (
  exporterUrl: string,
  validatedDbNamespaceBySystem: Readonly<Record<string, string>> | undefined,
  skipStreamEndpoints: boolean,
): SpanExporter => {
  // Default url is grpc://localhost:4317 (see OTLPTraceExporter docs).
  const otlpExporter = new OTLPTraceExporterGrpc({ url: exporterUrl })

  // db.namespace is added to the export payload, not the shared span, so other
  // processors/exporters still see the unmodified span.
  const withDbNamespace = validatedDbNamespaceBySystem
    ? new DbNamespaceSpanExporter(otlpExporter, {
        dbNamespaceBySystem: validatedDbNamespaceBySystem,
      })
    : otlpExporter

  // Drop SSE/streaming server spans so their multi-minute keep-alive durations
  // don't pollute span-duration latency metrics/SLOs.
  return skipStreamEndpoints ? new StreamSpanFilteringExporter(withDbNamespace) : withDbNamespace
}

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
   * When true, HTTP server spans for streaming / SSE responses are excluded
   * from the exported traces — and therefore from any latency metric or SLO
   * derived from their span duration. An SSE connection stays open for the
   * whole stream lifetime, so its server span's duration reflects the keep-alive
   * window (often minutes), not the time-to-first-byte, which otherwise skews
   * those metrics.
   *
   * Streaming requests are detected by the `Accept: text/event-stream` request
   * header (what browser `EventSource` clients are required to send, and the
   * same signal SSE content-negotiation keys on); matching spans are tagged and
   * dropped before export. The span still starts (so trace context propagates
   * to child spans) and stays visible to console / user-supplied span
   * processors.
   *
   * @default false
   */
  skipStreamEndpoints?: boolean

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
    skipStreamEndpoints = false,
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
      skipStreamEndpoints,
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

    const traceExporter = buildTraceExporter(
      exporterUrl,
      validatedDbNamespaceBySystem,
      skipStreamEndpoints,
    )

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
        createFastifyOtelInstrumentation(skippedPaths, skipStreamEndpoints),
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
