---
"@lokalise/fastify-api-contracts": minor
---

Add configurable error handling for `buildFastifyApiRoute` contract routes.

- Without configuration, errors go through the regular Fastify error handling chain (`setErrorHandler` or the default handler). On a live SSE stream — which can no longer take a status code — the configured error handler is invoked directly, so an SSE-aware handler can emit its own terminal `error` event and reporting side effects always run; the stream is closed afterwards.
- A `ResolveApiErrorResponse` (`(error, request, reply) => { statusCode, payload, headers? }`) customizes error serialization and reporting: per route via the `resolveErrorResponse` option, or app-wide for all contract routes via the new `fastifyApiContracts` plugin (the route option wins). With a resolver, regular errors are sent as `reply.status(statusCode).send(payload)` — bypassing `setErrorHandler` for contract routes, request validation errors included — and on a live SSE stream the `payload` becomes the data of the terminal `error` event.
- A raw Fastify `errorHandler` is not accepted in the route options (it would never see mid-stream SSE errors and could only half-replace the built-in behavior) — `resolveErrorResponse` is the single customization point.
