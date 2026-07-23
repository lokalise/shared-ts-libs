import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'

// Derived from the SpanExporter contract
type ExportResult = Parameters<Parameters<SpanExporter['export']>[1]>[0]

/**
 * Attribute marker set on the HTTP server span of a streaming/SSE response.
 * Set by this package's `requestHook` (keyed on the `Accept: text/event-stream`
 * request header); {@link StreamSpanFilteringExporter} drops every span
 * carrying it before those spans are exported. Internal to the package — not
 * part of the public API surface.
 */
export const STREAM_ENDPOINT_SPAN_ATTRIBUTE = 'stream.endpoint'

/**
 * A `SpanExporter` decorator that drops streaming/SSE server spans from the
 * export payload, then delegates the rest to the wrapped exporter.
 *
 * Why: an SSE/streaming response keeps the HTTP request open for the whole
 * lifetime of the stream (e.g. a 5-minute keep-alive), so the auto-instrumented
 * server span's duration is the stream lifetime, not the time-to-first-byte.
 * Any latency metric or SLO derived from that span's duration is then wrecked
 * by those multi-minute values. Dropping the span before it is exported removes
 * it from such metrics at the source — generically for every streaming
 * endpoint, with no per-route exclusion list to maintain.
 *
 * Why an exporter rather than a span processor or sampler: it layers onto a
 * single exporter, so console / other processors and exporters still observe
 * the stream spans (useful for local debugging). The shared span is never
 * mutated.
 */
export class StreamSpanFilteringExporter implements SpanExporter {
  private readonly delegate: SpanExporter

  constructor(delegate: SpanExporter) {
    this.delegate = delegate
  }

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    const kept = spans.filter((span) => span.attributes[STREAM_ENDPOINT_SPAN_ATTRIBUTE] !== true)
    // Empty batch: some OTLP transports treat it as a timeout/error, so
    // short-circuit with success (0 === ExportResultCode.SUCCESS).
    if (kept.length === 0) {
      resultCallback({ code: 0 })
      return
    }

    this.delegate.export(kept, resultCallback)
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown()
  }

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush?.() ?? Promise.resolve()
  }
}
