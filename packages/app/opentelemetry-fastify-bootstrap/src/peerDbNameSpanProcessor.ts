import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-base'

export interface PeerDbNameSpanProcessorOptions {
  /**
   * Maps an OTel `db.system` value to the database name to stamp as
   * `db.namespace` on matching spans. Example: `{ elasticsearch: 'lokalise' }`.
   * See {@link PeerDbNameSpanProcessor} for why and how.
   *
   * Keys and values must be non-empty strings; the constructor throws on
   * misconfigured entries so typos surface at startup instead of silently
   * no-op'ing in production.
   *
   * @see https://opentelemetry.io/docs/specs/semconv/database/database-spans/ for well-known `db.system` values
   */
  dbNames: Readonly<Record<string, string>>
}

/**
 * Stamps `db.namespace` on outbound DB spans based on the OTel `db.system`
 * value (falling back to `peer.db.system` when `db.system` is absent), and
 * mirrors `peer.db.system` from `db.system` when missing, so Datadog's APM
 * service catalog joins the spans to an existing inferred-service entity for
 * the cluster.
 *
 * Why this exists (per Datadog inferred-services behavior as of 2026-06):
 * when a downstream cluster (e.g. Elasticsearch) is reached by raw IP,
 * Datadog can't classify it from `peer.hostname` and routes the spans into
 * the synthetic `blocked-ip-address` service. Datadog's inferred-service
 * catalog DOES recognize entities keyed by `(peer.db.system, peer.db.name)`,
 * deriving `peer.db.name` from the OTel-canonical `db.namespace` attribute.
 * The Node `@elastic/transport` v8 client sets `db.system` but not
 * `db.namespace`; this processor fills the gap from a service-supplied
 * mapping. Existing non-empty string values are never overwritten.
 *
 * The mutation happens in `onEnd`, when the instrumentation libraries have
 * finished attaching attributes. Once a span has ended, `Span.setAttribute`
 * is a no-op, so the processor writes directly into the attribute map —
 * `ReadableSpan.attributes` is the same live object the writable span used.
 * Nothing in the SDK's types blocks the write (`readonly attributes` only
 * forbids reassigning the property, and the map type is mutable), but the
 * mutation is contractually unsanctioned and relies on
 * `@opentelemetry/sdk-trace-base` internals. If a future SDK upgrade makes
 * the assignment throw (e.g. by freezing attributes on span end), the failure
 * is caught, logged once, and further mutation attempts are disarmed — one
 * error log instead of a broken span pipeline.
 */
export class PeerDbNameSpanProcessor implements SpanProcessor {
  private readonly dbNames = new Map<string, string>()
  private mutationDisabled = false
  private readonly loggedSystems = new Set<string>()

  constructor(options: PeerDbNameSpanProcessorOptions) {
    // Copy validated entries into a Map so later mutation of the caller's
    // object can't bypass validation, and lookups can't hit Object.prototype.
    for (const [system, value] of Object.entries(options.dbNames)) {
      if (system.length === 0 || typeof value !== 'string' || value.length === 0) {
        throw new Error(
          `PeerDbNameSpanProcessor: dbNames[${JSON.stringify(system)}] must map a non-empty db.system key to a non-empty string`,
        )
      }
      this.dbNames.set(system, value)
    }
  }

  onStart(_span: Span): void {}

  onEnd(span: ReadableSpan): void {
    if (this.mutationDisabled) return

    const attrs = span.attributes as Record<string, unknown>

    const dbSystem = attrs['db.system'] ?? attrs['peer.db.system']
    if (typeof dbSystem !== 'string' || dbSystem.length === 0) return

    const mapped = this.dbNames.get(dbSystem)
    if (!mapped) return

    const needsNamespace = typeof attrs['db.namespace'] !== 'string' || !attrs['db.namespace']
    const needsPeerDbSystem =
      typeof attrs['peer.db.system'] !== 'string' || !attrs['peer.db.system']
    if (!needsNamespace && !needsPeerDbSystem) return

    try {
      if (needsNamespace) attrs['db.namespace'] = mapped
      if (needsPeerDbSystem) attrs['peer.db.system'] = dbSystem
    } catch (err) {
      // Never (re)throw from onEnd: a throw propagates synchronously through
      // MultiSpanProcessor and Span.end() into the instrumented application
      // code, and skips every later processor — silently dropping the span
      // from export. Disarm first so even a failing logger can't re-arm.
      this.mutationDisabled = true
      logEntry(
        'error',
        '[OTEL] PeerDbNameSpanProcessor: failed to mutate span attributes in onEnd; disabling further stamping. A @opentelemetry/sdk-trace-base upgrade may have changed its attribute mutability contract.',
        { error: err instanceof Error ? err.message : String(err) },
      )
      return
    }

    if (!this.loggedSystems.has(dbSystem)) {
      this.loggedSystems.add(dbSystem)
      logEntry('info', '[OTEL] PeerDbNameSpanProcessor: stamped first matching span', {
        dbSystem,
        dbNamespace: attrs['db.namespace'],
        stampedNamespace: needsNamespace,
        stampedPeerDbSystem: needsPeerDbSystem,
      })
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
