---
"@lokalise/opentelemetry-fastify-bootstrap": minor
---

Added optional `skipStreamEndpoints` option to `initOpenTelemetry` (default `false`). When enabled, HTTP server spans for streaming/SSE responses are excluded from the exported traces — and therefore from any latency metric or SLO derived from their span duration. An SSE connection stays open for the whole stream lifetime, so its server span's duration reflects the keep-alive window (often minutes) rather than the time-to-first-byte, which otherwise skews those metrics. Streaming requests are detected by the `Accept: text/event-stream` request header (what browser `EventSource` clients send, and the same signal SSE content-negotiation keys on); matching spans are tagged and dropped before export, generically for every streaming endpoint with no per-route exclusion list. The span still starts (so trace context propagates to child spans) and remains visible to console / user-supplied span processors.
