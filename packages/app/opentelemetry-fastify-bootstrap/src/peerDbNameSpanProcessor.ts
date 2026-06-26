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
 * value (falling back to `peer.db.system` when `db.system` is absent), so
 * Datadog's APM catalog joins the spans to an existing inferred-service entity.
 *
 * Why (per Datadog inferred-services behavior as of 2026-06): a cluster reached
 * by raw IP can't be classified from `peer.hostname` and gets bucketed into the
 * synthetic `blocked-ip-address` service. Datadog instead keys entities on the
 * `peer.db.*` tags, which it derives from short-form OTel attributes
 * (`peer.db.name` from `db.namespace`, `peer.db.system` from `db.system`) — so
 * we only set the vendor-neutral short form and never write `peer.*` ourselves.
 * The Node `@elastic/transport` v8 client sets `db.system` but not
 * `db.namespace`; this fills that one gap. An existing non-empty `db.namespace`
 * is never overwritten (an empty-string value is treated as absent).
 *
 * The write happens in `onEnd`, after instrumentation has attached attributes
 * and the span has ended — at which point `Span.setAttribute` is a no-op, so we
 * mutate `ReadableSpan.attributes` directly — it's the same live, mutable map
 * the writable span used. This relies
 * on `@opentelemetry/sdk-trace-base` internals; if a future SDK freezes the map
 * on span end, the assignment throws and we catch it, log once, and disarm —
 * one error log instead of a broken span pipeline.
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
    if (!needsNamespace) return

    try {
      attrs['db.namespace'] = mapped
    } catch (err) {
      // Never (re)throw from onEnd: a throw propagates synchronously through
      // MultiSpanProcessor and Span.end() into the instrumented application
      // code, and skips every later processor — silently dropping the span
      // from export. Disarm first so even a failing logger can't re-arm.
      this.mutationDisabled = true
      logEntry(
        'error',
        '[OTEL] PeerDbNameSpanProcessor: failed to mutate span attributes in onEnd; disabling further stamping. A @opentelemetry/sdk-trace-base upgrade may have changed its attribute mutability contract.',
        // Keep the stack: for a "should be impossible" failure (e.g. the SDK
        // froze the attribute map) the frame is what identifies the culprit.
        { error: err instanceof Error ? (err.stack ?? err.message) : String(err) },
      )
      return
    }

    if (!this.loggedSystems.has(dbSystem)) {
      this.loggedSystems.add(dbSystem)
      logEntry('info', '[OTEL] PeerDbNameSpanProcessor: stamped first matching span', {
        dbSystem,
        dbNamespace: attrs['db.namespace'],
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
