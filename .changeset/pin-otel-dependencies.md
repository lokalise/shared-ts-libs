---
"@lokalise/opentelemetry-fastify-bootstrap": minor
"@lokalise/context-fastify-plugins": major
---

Pin OpenTelemetry dependency versions so all services track a single validated set instead of resolving their own.

- `opentelemetry-fastify-bootstrap`: move the OpenTelemetry packages from `peerDependencies` to pinned `dependencies` (`fastify` stays a peer).
- `context-fastify-plugins`: align the OpenTelemetry versions with the bootstrap release train (`@opentelemetry/api` 1.9.1, experimental packages 0.221.0, stable packages 2.10.0, `@opentelemetry/semantic-conventions` 1.43.0).
