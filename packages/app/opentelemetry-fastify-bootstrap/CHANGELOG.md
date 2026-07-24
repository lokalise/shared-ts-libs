# @lokalise/opentelemetry-fastify-bootstrap

## 4.0.0

### Major Changes

- 780b625: Added `skipStreamEndpoints` option to `initOpenTelemetry`, now enabled by default (`true`). When enabled, HTTP server spans for streaming/SSE responses are excluded from the exported traces — and therefore from any latency metric or SLO derived from their span duration. An SSE connection stays open for the whole stream lifetime, so its server span's duration reflects the keep-alive window (often minutes) rather than the time-to-first-byte, which otherwise skews those metrics. Streaming requests are detected by the `Accept: text/event-stream` request header (what browser `EventSource` clients send, and the same signal SSE content-negotiation keys on); matching spans are tagged and dropped before export, generically for every streaming endpoint with no per-route exclusion list. The span still starts (so trace context propagates to child spans) and remains visible to console / user-supplied span processors.

  BREAKING CHANGE: streaming/SSE server spans are no longer exported by default. Set `skipStreamEndpoints: false` to restore the previous behavior of exporting these spans.

## 3.1.0

### Minor Changes

- 6ecf25c: Added optional `dbNamespaceBySystem` option to `initOpenTelemetry` (e.g. `dbNamespaceBySystem: { elasticsearch: 'lokalise' }`). When configured, the Datadog-bound trace exporter is wrapped so matching outbound DB spans (by `db.system`) carry the OTel-canonical `db.namespace` in the export payload. Datadog adds the `peer.*` prefix itself (deriving `peer.db.name` from `db.namespace` and `peer.db.system` from `db.system`), so only the vendor-neutral short-form attribute is set. This joins those spans to Datadog's existing inferred-service entity for the cluster — useful for the Node.js `@elastic/transport` v8 client, which sets `db.system: elasticsearch` but never `db.namespace`, leaving outbound ES calls in Datadog's synthetic `blocked-ip-address` bucket. Only the export payload is shaped (via a non-mutating view of the span), so other processors/exporters still see the unmodified span. `DbNamespaceSpanExporter` is exported for wrapping an exporter directly.

## 3.0.0

### Major Changes

- fbc0be3: Bump OpenTelemetry peer dependencies to latest: `@fastify/otel` to 0.18.1, `@opentelemetry/auto-instrumentations-node` to ^0.76.0, `@opentelemetry/exporter-trace-otlp-grpc` and `@opentelemetry/sdk-node` to ^0.218.0, `@opentelemetry/sdk-trace-base` to ^2.7.1. Removed the `@opentelemetry/instrumentation-fastify` disable flag — it's no longer bundled by auto-instrumentations-node since v0.76.0 (fastify is instrumented exclusively by `@fastify/otel`).
