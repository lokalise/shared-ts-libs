---
"@lokalise/opentelemetry-fastify-bootstrap": patch
---

Start `NodeSDK` with empty `metricReaders` and `logRecordProcessors`. sdk-node no longer creates OTLP metrics and logs exporters from environment defaults, and `gracefulOtelShutdown()` no longer retries against `localhost:4318` for 8-15 seconds.
