import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'

export interface DbNamespaceSpanExporterOptions {
  /**
   * Maps an OTel `db.system` value to the `db.namespace` to add on matching
   * spans in the export payload. Example: `{ elasticsearch: 'lokalise' }`. See
   * {@link DbNamespaceSpanExporter} for why and how.
   *
   * Keys and values must be non-empty strings; the constructor throws on
   * misconfigured entries so typos surface at startup instead of silently
   * no-op'ing in production.
   *
   * @see https://opentelemetry.io/docs/specs/semconv/database/database-spans/ for well-known `db.system` values
   */
  dbNamespaceBySystem: Readonly<Record<string, string>>
}

/**
 * A `SpanExporter` decorator that adds `db.namespace` to outbound DB spans in
 * the export payload — based on the OTel `db.system` value (falling back to
 * `peer.db.system` when `db.system` is absent) — then delegates to the wrapped
 * exporter. It exists so Datadog's APM catalog joins those spans to an existing
 * inferred-service entity for the cluster.
 *
 * Why (per Datadog inferred-services behavior as of 2026-06): a cluster reached
 * by raw IP can't be classified from `peer.hostname` and gets bucketed into the
 * synthetic `blocked-ip-address` service. Datadog instead keys entities on the
 * `peer.db.*` tags, which it derives from short-form OTel attributes
 * (`peer.db.name` from `db.namespace`, `peer.db.system` from `db.system`). The
 * Node `@elastic/transport` v8 client sets `db.system` but not `db.namespace`;
 * this fills that one gap. An existing non-empty `db.namespace` is never
 * replaced.
 *
 * Why an exporter rather than a span processor: a constant like `lokalise` is a
 * Datadog entity-keying heuristic, not the span's true OTel `db.namespace`. A
 * mutating processor would write it into the one `ReadableSpan` shared by every
 * processor and exporter, so any other consumer (a different dashboard, OTel-
 * native tooling) would read it as the real namespace. An exporter is instead
 * contractually allowed to shape its own export payload, so we wrap only the
 * Datadog-bound exporter and leave the shared span untouched. This also sheds
 * the fragility of mutating SDK-internal state: the original object is never
 * written to (we return a `Proxy` overriding only `attributes`), so a future
 * SDK that freezes span attributes cannot break this.
 */
export class DbNamespaceSpanExporter implements SpanExporter {
  private readonly delegate: SpanExporter
  private readonly dbNamespaceBySystem: Map<string, string>
  private readonly loggedSystems = new Set<string>()

  constructor(delegate: SpanExporter, options: DbNamespaceSpanExporterOptions) {
    this.delegate = delegate
    this.dbNamespaceBySystem = assertValidDbNamespaceBySystem(options.dbNamespaceBySystem)
  }

  export(spans: ReadableSpan[], resultCallback: Parameters<SpanExporter['export']>[1]): void {
    this.delegate.export(
      spans.map((span) => this.withDbNamespace(span)),
      resultCallback,
    )
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown()
  }

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush?.() ?? Promise.resolve()
  }

  /**
   * Returns the span unchanged unless it is an unmapped/already-namespaced DB
   * span; otherwise returns a non-mutating view with `db.namespace` added.
   */
  private withDbNamespace(span: ReadableSpan): ReadableSpan {
    const attrs = span.attributes

    const dbSystem = attrs['db.system'] ?? attrs['peer.db.system']
    if (typeof dbSystem !== 'string' || dbSystem.length === 0) return span

    const mapped = this.dbNamespaceBySystem.get(dbSystem)
    if (!mapped) return span

    const existing = attrs['db.namespace']
    if (typeof existing === 'string' && existing.length > 0) return span

    // The source span is shared with every other processor/exporter, so we must
    // not write to it. Return a Proxy that overrides only `attributes`; all
    // other reads (spanContext(), resource, status, …) delegate to the original
    // with `this` bound to it.
    const attributes = { ...attrs, 'db.namespace': mapped }
    const view = new Proxy(span, {
      get(target, prop, _receiver) {
        if (prop === 'attributes') return attributes
        const value = Reflect.get(target, prop, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })

    if (!this.loggedSystems.has(dbSystem)) {
      this.loggedSystems.add(dbSystem)
      logEntry(
        'info',
        '[OTEL] DbNamespaceSpanExporter: added db.namespace to first matching span',
        {
          dbSystem,
          dbNamespace: mapped,
        },
      )
    }

    return view
  }
}

/**
 * Validates a `db.system` -> `db.namespace` mapping and copies it into a `Map`
 * so later mutation of the caller's object can't bypass validation and lookups
 * can't hit `Object.prototype`. Throws on any empty key or non-empty-string
 * value so typos fail at startup. Exported so the bootstrap can fail fast in
 * every environment, not only when the exporter is constructed.
 */
export function assertValidDbNamespaceBySystem(
  dbNamespaceBySystem: Readonly<Record<string, string>>,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const [system, value] of Object.entries(dbNamespaceBySystem)) {
    if (system.length === 0 || typeof value !== 'string' || value.length === 0) {
      throw new Error(
        `DbNamespaceSpanExporter: dbNamespaceBySystem[${JSON.stringify(system)}] must map a non-empty db.system key to a non-empty db.namespace string`,
      )
    }
    map.set(system, value)
  }
  return map
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
