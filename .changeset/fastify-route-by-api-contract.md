---
"@lokalise/fastify-api-contracts": minor
---

Add `buildFastifyApiRoute` and `buildFastifyApiRouteHandler` for `defineApiContract` contracts, with support for SSE-only and dual-mode (JSON + SSE) routes in addition to plain JSON routes. The handler shape is inferred from the contract's `responsesByStatusCode`: non-SSE contracts take a `(request, reply) => { status, body }` handler, SSE-only contracts take a `(request, sse) => ...` handler, and dual-mode contracts take a `{ nonSse, sse }` object branched by the `Accept` header. The route method, URL, request schemas and response schema are derived from the contract; SSE lifecycle hooks (`onConnect`, `onClose`, `onReconnect`, `serializer`, `heartbeatInterval`) and a `defaultMode` for dual-mode routes are configurable via the options argument.

SSE and dual-mode routes require the `@fastify/sse` plugin, which is now a peer dependency.
