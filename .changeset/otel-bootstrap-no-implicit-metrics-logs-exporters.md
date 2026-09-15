---
"@lokalise/opentelemetry-fastify-bootstrap": patch
---

Pass explicit empty `metricReaders` and `logRecordProcessors` to `NodeSDK`. Without them, sdk-node reads `OTEL_METRICS_EXPORTER` and `OTEL_LOGS_EXPORTER` from the environment, both default to `otlp`, and the SDK creates exporters aimed at `http://localhost:4318`. No collector listens there, connection errors count as retryable, and the final flush in `gracefulOtelShutdown()` retried with backoff for 8-15 seconds on every shutdown. Only traces are configured by this package, so nothing is lost; shutdown now completes in milliseconds.
