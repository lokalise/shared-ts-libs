---
"@lokalise/fastify-api-contracts": major
---

Add `buildFastifyApiRoute`, a route builder for `defineApiContract` contracts that serves plain JSON, blob and SSE responses from a single typed handler.

**Handler model**

- Every handler is `(request, reply, context) => { status, body }`, typed from the contract's `responsesByStatusCode`; wildcard status keys (`'4xx'`, `'2xx'`, `'default'`) accept the concrete statuses they cover.
- When a status declares several media types in its content map, the result also requires an explicit `contentType` — `{ status, contentType, body }` — which discriminates the `body` type at compile time and selects the matching per-media-type serializer schema; with a single declared media type it is optional and derived from the contract.
- `context.expectedContentType` holds the client's `Accept`-negotiated preference (with `q=` quality values and wildcards) among the contract-declared response content-types, or `null` when none is acceptable; the underlying `determineResponseContentType(request, contentTypes)` helper is also exported for custom candidate lists.
- A `blobBody()` descriptor accepts a `string`/`Buffer`/`Readable` body sent with the declared media type; a `noBodyResponse()` status requires `body: null`.
- The route method, URL, request schemas and response schemas are derived from the contract, and the contract itself is exposed as `config.apiContract` for hooks and handlers.

**SSE support**

- For an SSE status the `body` is an `AsyncIterable` of the contract's events (e.g. from an `async function*`), which the framework validates against the event schemas, streams, and closes.
- Contracts declaring an SSE response (an `sseBody()` content-map descriptor, SSE-only or mixed with JSON) extend the context with `context.sse`; `sse.start(...)` drives the session imperatively for keep-alive, lifecycle hooks, or reconnection.
- When the contract declares several `sseBody()` representations, `sse.start()` requires a `{ statusCode, contentType }` selection and the session's `send`/`sendStream` are typed by (and validate against) exactly the selected representation's event schemas.
- SSE-capable routes are registered in `@fastify/sse` `'manual'` mode — no `Accept`-header negotiation; the handler alone decides at runtime whether to stream or send a regular HTTP response (supporting clients that signal streaming via the request body, e.g. OpenAI-style `{ stream: true }`).
- SSE lifecycle hooks (`onConnect`, `onClose`, `onReconnect`, `serializer`, `heartbeat`) are configurable via the options argument.

**OpenAPI**

- Every response entry is mapped into `schema.response`, so the full contract shows up in a generated spec: content-map entries become Fastify per-media-type response schemas (JSON descriptors keep their Zod schema and drive content-type-aware serialization), `blobBody()` maps to a binary string, `sseBody()` to the union of its event envelopes `{ event, data, id?, retry? }` per the OpenAPI convention for `text/event-stream`, and `noBodyResponse()` maps to `z.null()`, rendered by `@fastify/swagger` as a body-less response.

**Dependencies**

- `@fastify/sse` (>= 0.5.0, for `'manual'` mode) is a new **optional** peer dependency — only needed for contracts that declare an SSE response.
- `fastify-type-provider-zod`, which this module has always required at runtime, is now a declared peer dependency (`>=7.0.0` — v7 is needed to generate an OpenAPI spec from content-map schemas).

**BREAKING**

- The `@lokalise/api-contracts` peer dependency floor is raised from `>=6.5.1` to `>=7.0.0` — the new route builder is built on the v7 response API (mandatory contract `summary`, content-map response entries; the removed tagged `textResponse`/`anyOfResponses` responses are not supported) and is exported from the package entry point, so consumers must upgrade `@lokalise/api-contracts` to v7 before taking this release. The existing builder APIs themselves are unchanged.
