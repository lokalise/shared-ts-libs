---
'@lokalise/opentelemetry-fastify-bootstrap': patch
---

Fix `skipStreamEndpoints` not filtering the HTTP SERVER span. The SSE marker was only applied via the FastifyOtel `requestHook`, so the fastify request span was dropped but the `http.server.request` SERVER span created by `@opentelemetry/instrumentation-http` — the service entry span that latency metrics/SLOs are derived from — was still exported with the full stream lifetime as its duration. The marking hook is now also wired into `@opentelemetry/instrumentation-http` via `getNodeAutoInstrumentations`, so both request-level spans are dropped for streaming/SSE requests.
