---
"@lokalise/opentelemetry-fastify-bootstrap": minor
---

Add Drizzle ORM query tracing via `@kubiks/otel-drizzle` (re-exported `instrumentDrizzleClient` / `instrumentDrizzle`), covering drivers like postgres.js that the node auto-instrumentations don't patch.
