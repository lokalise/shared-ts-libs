---
"@lokalise/opentelemetry-fastify-bootstrap": minor
---

`gracefulOtelShutdown()` stops waiting for the SDK after 5 seconds, logs a warning and resolves. A hung `sdk.shutdown()` no longer blocks the caller's shutdown until its own deadline kills the process. Pass `{ timeoutMs }` to change the limit.
