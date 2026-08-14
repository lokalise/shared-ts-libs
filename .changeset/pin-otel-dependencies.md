---
"@lokalise/opentelemetry-fastify-bootstrap": minor
"@lokalise/context-fastify-plugins": major
---

Pin OpenTelemetry dependency versions so all services track a single validated set instead of resolving their own.

- `opentelemetry-fastify-bootstrap`: move the OpenTelemetry SDK packages from `peerDependencies` to pinned `dependencies`. `fastify` and `@opentelemetry/api` stay peers — `api` is a process-wide singleton, so it's kept as a peer (`>=1.9.0 <1.10.0`) to avoid duplicate copies when a host already provides one (e.g. via `dd-trace`).
- `context-fastify-plugins`: align the OpenTelemetry versions with the bootstrap release train (`@opentelemetry/api` 1.9.1, experimental packages 0.221.0, stable packages 2.10.0, `@opentelemetry/semantic-conventions` 1.43.0).
