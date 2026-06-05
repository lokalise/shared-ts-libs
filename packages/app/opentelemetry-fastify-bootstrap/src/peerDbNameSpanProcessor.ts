import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-base'

export interface PeerDbNameSpanProcessorOptions {
  /**
   * Maps the OTel `db.system` value to the database name to stamp as
   * `db.namespace` on the span. Example: `{ elasticsearch: 'lokalise' }`
   * joins outbound ES spans to a Datadog inferred-service entity keyed on
   * `(peer.db.system:elasticsearch, peer.db.name:lokalise)` — Datadog derives
   * `peer.db.name` from `db.namespace`.
   *
   * Values must be non-empty strings; the constructor throws on misconfigured
   * entries so typos surface at startup instead of silently no-op'ing in
   * production.
   */
  dbNames: Record<string, string>
}

/**
 * Stamps `db.namespace` on outbound DB spans based on the OTel `db.system`
 * value, so Datadog's APM service catalog joins them to an existing
 * inferred-service entity for the cluster.
 *
 * Why this exists: when a downstream cluster (e.g. Elasticsearch) is reached
 * by raw IP, Datadog can't classify it from `peer.hostname` and routes the
 * spans into the synthetic `blocked-ip-address` service. Datadog's
 * inferred-service catalog DOES recognize entities keyed by
 * `(peer.db.system, peer.db.name)`, deriving `peer.db.name` from the
 * OTel-canonical `db.namespace`. The Node `@elastic/transport` v8 client sets
 * `db.system` but not `db.namespace`; this processor fills the gap from a
 * service-supplied mapping.
 *
 * The mutation happens in `onEnd`, which is when the instrumentation libraries
 * have finished attaching attributes. Once a span has ended,
 * `Span.setAttribute` is a no-op, so the processor writes directly into the
 * attribute map — `ReadableSpan.attributes` is the same object the writable
 * span used. This relies on `@opentelemetry/sdk-trace-base` internals (the
 * `ReadableSpan` type marks `attributes` `Readonly`, so the cast is required).
 * If a future SDK upgrade freezes attributes on span end, the first failed
 * assignment is caught, logged once, and further mutation attempts are
 * disarmed — the SDK upgrade surfaces as a single error log rather than a
 * thrown TypeError on every DB span.
 */
export class PeerDbNameSpanProcessor implements SpanProcessor {
  private readonly dbNames: Record<string, string>
  private mutationDisabled = false
  private readonly loggedSystems = new Set<string>()

  constructor(options: PeerDbNameSpanProcessorOptions) {
    for (const [system, value] of Object.entries(options.dbNames)) {
      if (typeof value !== 'string' || value.length === 0) {
        throw new Error(
          `PeerDbNameSpanProcessor: dbNames[${JSON.stringify(system)}] must be a non-empty string`,
        )
      }
    }
    this.dbNames = options.dbNames
  }

  onStart(_span: Span): void {}

  onEnd(span: ReadableSpan): void {
    if (this.mutationDisabled) return

    const attrs = span.attributes as Record<string, unknown>

    const dbSystem = attrs['db.system'] ?? attrs['peer.db.system']
    if (typeof dbSystem !== 'string' || dbSystem.length === 0) return

    const mapped = this.dbNames[dbSystem]
    if (!mapped) return

    const needsNamespace = typeof attrs['db.namespace'] !== 'string' || !attrs['db.namespace']
    const needsPeerDbSystem =
      typeof attrs['peer.db.system'] !== 'string' || !attrs['peer.db.system']
    if (!needsNamespace && !needsPeerDbSystem) return

    try {
      // OTel 1.27+ canonical attribute. Datadog derives peer.db.name from it
      // when constructing the inferred-service entity key.
      if (needsNamespace) attrs['db.namespace'] = mapped
      // Some instrumentations (e.g. @elastic/transport) set db.system but not
      // peer.db.system. Datadog's inferred-service entity key uses peer.db.*,
      // so mirror it across.
      if (needsPeerDbSystem) attrs['peer.db.system'] = dbSystem
    } catch (err) {
      // Defensive: if a future SDK version freezes attributes on span end,
      // every assignment throws TypeError in strict mode. Log once, disarm,
      // and stop attempting on subsequent spans.
      if (err instanceof TypeError) {
        this.mutationDisabled = true
        logEntry(
          'error',
          '[OTEL] PeerDbNameSpanProcessor: span attributes are not mutable in onEnd; disabling further stamping. The @opentelemetry/sdk-trace-base version likely changed its attribute mutability contract.',
          { error: err.message },
        )
        return
      }
      throw err
    }

    if (!this.loggedSystems.has(dbSystem)) {
      this.loggedSystems.add(dbSystem)
      logEntry(
        'info',
        '[OTEL] PeerDbNameSpanProcessor: stamped db.namespace on first matching span',
        { dbSystem, dbNamespace: mapped },
      )
    }
  }

  async forceFlush(): Promise<void> {}
  async shutdown(): Promise<void> {}
}

// Mirrors the JSON log shape used by `initOpenTelemetry` so all bootstrap
// output is greppable with the same parser. Kept local to avoid coupling this
// file to a logger module the package doesn't otherwise need.
function logEntry(level: 'info' | 'error', msg: string, data?: Record<string, unknown>): void {
  const entry = { level, time: Date.now(), msg, ...data }
  const output = JSON.stringify(entry)
  if (level === 'error') {
    // biome-ignore lint/suspicious/noConsole: bootstrap logger
    console.error(output)
  } else {
    // biome-ignore lint/suspicious/noConsole: bootstrap logger
    console.log(output)
  }
}
