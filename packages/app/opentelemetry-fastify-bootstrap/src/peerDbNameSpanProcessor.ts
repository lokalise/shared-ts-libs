import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-base'

export interface PeerDbNameSpanProcessorOptions {
  /**
   * Maps the OTel `db.system` value to the database name to stamp as
   * `db.namespace` on the span. Example: `{ elasticsearch: 'lokalise' }`
   * joins outbound ES spans to a Datadog inferred-service entity keyed on
   * `(peer.db.system:elasticsearch, peer.db.name:lokalise)` — Datadog derives
   * `peer.db.name` from `db.namespace`.
   */
  dbNames: Record<string, string>
}

/**
 * Stamps `db.namespace` on outbound DB spans based on the OTel `db.system`
 * value, so Datadog's APM service catalog joins them to an existing
 * inferred-service entity for the cluster.
 *
 * Why this exists: when a downstream cluster (e.g. Elasticsearch) is reached
 * through a Kubernetes service IP, Datadog can't classify it from
 * `peer.hostname` and routes the spans into the synthetic `blocked-ip-address`
 * service. Datadog's inferred-service catalog DOES recognize entities keyed by
 * `(peer.db.system, peer.db.name)`, deriving `peer.db.name` from the
 * OTel-canonical `db.namespace`. The Node `@elastic/transport` v8 client sets
 * `db.system` but not `db.namespace`; this processor fills the gap from a
 * service-supplied mapping.
 *
 * The mutation happens in `onEnd`, which is when the instrumentation libraries
 * have finished attaching attributes. Once a span has ended, `Span.setAttribute`
 * is a no-op, so the processor writes directly into the attribute map —
 * `ReadableSpan.attributes` is the same object the writable span used.
 */
export class PeerDbNameSpanProcessor implements SpanProcessor {
  private readonly dbNames: Record<string, string>

  constructor(options: PeerDbNameSpanProcessorOptions) {
    this.dbNames = options.dbNames
  }

  onStart(_span: Span): void {}

  onEnd(span: ReadableSpan): void {
    const attrs = span.attributes as Record<string, unknown>

    const dbSystem = attrs['db.system'] ?? attrs['peer.db.system']
    if (typeof dbSystem !== 'string' || dbSystem.length === 0) return

    const mapped = this.dbNames[dbSystem]
    if (!mapped) return

    // OTel 1.27+ canonical attribute. Datadog derives peer.db.name from it
    // when constructing the inferred-service entity key.
    if (typeof attrs['db.namespace'] !== 'string' || !attrs['db.namespace']) {
      attrs['db.namespace'] = mapped
    }

    // Some instrumentations (e.g. @elastic/transport) set db.system but not
    // peer.db.system. Datadog's inferred-service entity key uses peer.db.*, so
    // mirror it across.
    if (typeof attrs['peer.db.system'] !== 'string' || !attrs['peer.db.system']) {
      attrs['peer.db.system'] = dbSystem
    }
  }

  async forceFlush(): Promise<void> {}
  async shutdown(): Promise<void> {}
}
