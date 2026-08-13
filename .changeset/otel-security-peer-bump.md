---
"@lokalise/opentelemetry-fastify-bootstrap": major
---

Bump OpenTelemetry peer dependencies for upstream security patches: `@opentelemetry/sdk-node` and `@opentelemetry/exporter-trace-otlp-grpc` to ^0.221.0, `@opentelemetry/auto-instrumentations-node` to ^0.79.0, `@opentelemetry/sdk-trace-base` to ^2.10.0. sdk-node 0.218 exact-pinned `@opentelemetry/core@2.7.1` (unbounded memory allocation in W3C Baggage propagation, fixed in 2.8.0) and `@opentelemetry/propagator-jaeger@2.7.1` (DoS via unhandled exception on a malformed header, fixed in 2.9.0); sdk-node 0.221 pins both at 2.10.0, letting consumers drop workaround overrides for those advisories.

BREAKING CHANGE: consumers must provide `@opentelemetry/sdk-node`/`@opentelemetry/exporter-trace-otlp-grpc` ^0.221.0, `@opentelemetry/auto-instrumentations-node` ^0.79.0, and `@opentelemetry/sdk-trace-base` ^2.10.0.
