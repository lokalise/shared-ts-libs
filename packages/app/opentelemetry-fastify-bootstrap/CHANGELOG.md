# @lokalise/opentelemetry-fastify-bootstrap

## 3.0.0

### Major Changes

- fbc0be3: Bump OpenTelemetry peer dependencies to latest: `@fastify/otel` to 0.18.1, `@opentelemetry/auto-instrumentations-node` to ^0.76.0, `@opentelemetry/exporter-trace-otlp-grpc` and `@opentelemetry/sdk-node` to ^0.218.0, `@opentelemetry/sdk-trace-base` to ^2.7.1. Removed the `@opentelemetry/instrumentation-fastify` disable flag — it's no longer bundled by auto-instrumentations-node since v0.76.0 (fastify is instrumented exclusively by `@fastify/otel`).
