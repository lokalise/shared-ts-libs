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
  PeerDbNameSpanProcessor,
  type PeerDbNameSpanProcessorOptions,
} from './peerDbNameSpanProcessor.ts'

export {
  PeerDbNameSpanProcessor,
  type PeerDbNameSpanProcessorOptions,
} from './peerDbNameSpanProcessor.ts'

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

function resolvePeerDbNameProcessor(
  peerDbNames: PeerDbNameSpanProcessorOptions | undefined,
): SpanProcessor | undefined {
  if (!peerDbNames || Object.keys(peerDbNames.dbNames).length === 0) return undefined
  return new PeerDbNameSpanProcessor(peerDbNames)
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
   * Stamp `db.namespace` on outbound DB spans (and mirror `peer.db.system`
   * from `db.system` when missing) so they join Datadog's existing
   * inferred-service entity for the cluster, instead of landing in the
   * synthetic `blocked-ip-address` bucket.
   *
   * Datadog derives `peer.db.name` from the OTel-canonical `db.namespace`.
   *
   * @example
   * ```ts
   * peerDbNames: { dbNames: { elasticsearch: 'lokalise' } }
   * ```
   */
  peerDbNames?: PeerDbNameSpanProcessorOptions
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
    peerDbNames,
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
      peerDbNamesConfigured: peerDbNames ? Object.keys(peerDbNames.dbNames) : [],
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

    // peer.db.name stamping must run before the BatchSpanProcessor in the
    // processor chain so the BSP serializes the mutated attributes when it
    // flushes (BSP buffers spans rather than serializing on onEnd, so timing
    // happens to work out today — placing this first defends against future
    // BSP changes that might serialize eagerly).
    const peerDbNameProcessor = resolvePeerDbNameProcessor(peerDbNames)
    const allSpanProcessors: SpanProcessor[] = [
      ...(peerDbNameProcessor ? [peerDbNameProcessor] : []),
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
