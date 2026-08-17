# @lokalise/opentelemetry-fastify-bootstrap

## 4.1.0

### Minor Changes

- b332c1d: Pin OpenTelemetry dependency versions so all services track a single validated set instead of resolving their own.

  - `opentelemetry-fastify-bootstrap`: move the OpenTelemetry SDK packages from `peerDependencies` to pinned `dependencies`. `fastify` and `@opentelemetry/api` stay peers — `api` is a process-wide singleton, so it's kept as a peer (`>=1.9.0 <1.10.0`) to avoid duplicate copies when a host already provides one (e.g. via `dd-trace`).
  - `context-fastify-plugins`: align the OpenTelemetry versions with the bootstrap release train (experimental packages 0.221.0, stable packages 2.10.0, `@opentelemetry/semantic-conventions` 1.43.0). `@opentelemetry/api` is no longer a direct dependency (it was never imported directly; the SDK packages bring it).

  **Migration:** these packages now own the OpenTelemetry SDK versions. Services should drop their own direct `@opentelemetry/*` SDK dependencies and let these packages own them. Because the SDK packages are pinned to exact versions, a service keeping its own (differently resolved) direct SDK dep will get a second copy, and objects passed across that boundary (span processors, samplers, exporters) can fail cross-copy `instanceof` checks. If a direct OTel SDK dep is unavoidable, align it to the exact versions pinned here or enforce it via a package-manager `override`. `@opentelemetry/api` stays a shared peer/singleton.

## 4.0.2

### Patch Changes

- edbe3f5: Bump OpenTelemetry peer dependencies for upstream security patches: `@opentelemetry/sdk-node` and `@opentelemetry/exporter-trace-otlp-grpc` to ^0.221.0, `@opentelemetry/auto-instrumentations-node` to ^0.79.0, `@opentelemetry/sdk-trace-base` to ^2.10.0. sdk-node 0.218 exact-pinned `@opentelemetry/core@2.7.1` (unbounded memory allocation in W3C Baggage propagation, fixed in 2.8.0) and `@opentelemetry/propagator-jaeger@2.7.1` (DoS via unhandled exception on a malformed header, fixed in 2.9.0); sdk-node 0.221 pins both at 2.10.0, letting consumers drop workaround overrides for those advisories.

  Note: consumers must update their own peers to `@opentelemetry/sdk-node`/`@opentelemetry/exporter-trace-otlp-grpc` ^0.221.0, `@opentelemetry/auto-instrumentations-node` ^0.79.0, and `@opentelemetry/sdk-trace-base` ^2.10.0 when picking up this release.

## 4.0.1

### Patch Changes

- fa2ef41: Fix `skipStreamEndpoints` not filtering the HTTP SERVER span. The SSE marker was only applied via the FastifyOtel `requestHook`, so the fastify request span was dropped but the `http.server.request` SERVER span created by `@opentelemetry/instrumentation-http` — the service entry span that latency metrics/SLOs are derived from — was still exported with the full stream lifetime as its duration. The marking hook is now also wired into `@opentelemetry/instrumentation-http` via `getNodeAutoInstrumentations`, so both request-level spans are dropped for streaming/SSE requests.

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
