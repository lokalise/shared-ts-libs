# @lokalise/fastify-api-contracts

## 6.1.1

### Patch Changes

- e3eea4f: Document error handling for `buildFastifyApiRoute` contract routes in the README: errors follow the regular Fastify error handling chain, and a global `setErrorHandler` serving SSE routes must branch on the live-stream state (`reply.sse?.isConnected && reply.raw.headersSent`) to send a terminal `error` event instead of a status code.

## 6.1.0

### Minor Changes

- 49085ba: Propagate the contract's `tags` into the Fastify route schema in `buildFastifyRoute`, `buildFastifyNoPayloadRoute` and `buildFastifyPayloadRoute`, so contracts built with `buildRestContract({ tags: [...] })` produce tagged operations in the generated OpenAPI spec.

  Previously only `summary` and `description` were mapped, so `@fastify/swagger` — which reads operation tags from `schema.tags` — grouped every such route under `default`. `ExtendedFastifySchema` now declares the `tags` field; contracts without `tags` are unaffected (the field is dropped by `copyWithoutUndefined` as before).

## 6.0.0

### Major Changes

- 1fc578d: Add `buildFastifyApiRoute`, a route builder for `defineApiContract` contracts that serves plain JSON, blob and SSE responses from a single typed handler.

  **Handler model**

  - Every handler is `(request, reply, context) => { status, body }`, typed from the contract's `responsesByStatusCode`; wildcard status keys (`'4xx'`, `'2xx'`, `'default'`) accept the concrete statuses they cover.
  - When a status declares several media types in its content map, the result also requires an explicit `contentType` — `{ status, contentType, body }` — which discriminates the `body` type at compile time and selects the matching per-media-type serializer schema; with a single declared media type it is optional and derived from the contract.
  - `context.expectedContentType` holds the client's `Accept`-negotiated preference (with `q=` quality values and wildcards) among the content-types the contract's **success** entries declare (error responses are not offered), or `null` when none is acceptable; candidates keep the contract's declaration order, so under `Accept: */*` the first declared success content-type wins. The underlying `determineResponseContentType(request, contentTypes)` helper is also exported for custom candidate lists.
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

## 5.4.1

### Patch Changes

- dae7dc7: Make the contract `summary` field mandatory on `defineApiContract`, and surface it in the http-client `UnexpectedResponseError` for debugging.

  - `summary` is now required on every contract (previously optional).
  - `UnexpectedResponseError` (fe + be) gains a required `summary` constructor argument and a `readonly summary` field, and includes it in the error message (`Unexpected response for "<summary>": …`). `sendByApiContract` passes `contract.summary` through automatically.

## 5.4.0

### Minor Changes

- 2c810de: Add `injectByApiContract`, a test-request injector for contracts created with `defineApiContract` (the current `@lokalise/api-contracts` API). It mirrors `injectByContract` but resolves its params (`pathParams`/`body`/`queryParams`/`headers`/`pathPrefix`) directly from the `defineApiContract` contract, including `ContractNoBody` handling and an optional `pathPrefix` that is prepended to the resolved path. The resolved params type is exported as `InjectByApiContractParams`.
