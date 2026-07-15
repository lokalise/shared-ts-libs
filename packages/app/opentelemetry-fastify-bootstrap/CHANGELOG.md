# @lokalise/opentelemetry-fastify-bootstrap

## 3.1.0

### Minor Changes

- 6ecf25c: Added optional `dbNamespaceBySystem` option to `initOpenTelemetry` (e.g. `dbNamespaceBySystem: { elasticsearch: 'lokalise' }`). When configured, the Datadog-bound trace exporter is wrapped so matching outbound DB spans (by `db.system`) carry the OTel-canonical `db.namespace` in the export payload. Datadog adds the `peer.*` prefix itself (deriving `peer.db.name` from `db.namespace` and `peer.db.system` from `db.system`), so only the vendor-neutral short-form attribute is set. This joins those spans to Datadog's existing inferred-service entity for the cluster — useful for the Node.js `@elastic/transport` v8 client, which sets `db.system: elasticsearch` but never `db.namespace`, leaving outbound ES calls in Datadog's synthetic `blocked-ip-address` bucket. Only the export payload is shaped (via a non-mutating view of the span), so other processors/exporters still see the unmodified span. `DbNamespaceSpanExporter` is exported for wrapping an exporter directly.

## 3.0.0

### Major Changes

- fbc0be3: Bump OpenTelemetry peer dependencies to latest: `@fastify/otel` to 0.18.1, `@opentelemetry/auto-instrumentations-node` to ^0.76.0, `@opentelemetry/exporter-trace-otlp-grpc` and `@opentelemetry/sdk-node` to ^0.218.0, `@opentelemetry/sdk-trace-base` to ^2.7.1. Removed the `@opentelemetry/instrumentation-fastify` disable flag — it's no longer bundled by auto-instrumentations-node since v0.76.0 (fastify is instrumented exclusively by `@fastify/otel`).
