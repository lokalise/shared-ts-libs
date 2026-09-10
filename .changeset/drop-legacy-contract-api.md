---
"@lokalise/api-contracts": major
"@lokalise/backend-http-client": major
"@lokalise/frontend-http-client": major
"@lokalise/fastify-api-contracts": major
"@lokalise/universal-testing-utils": major
---

Remove the deprecated contract definition API. `defineApiContract` is now the only way to define a contract, and the short names in the client, server and testing packages now point at the `defineApiContract`-based implementations.

- `@lokalise/api-contracts`: removed `buildGetRoute`, `buildPayloadRoute`, `buildDeleteRoute`, `buildRestContract`, `buildContract`, `buildSseContract`, `mapRouteToPath`, `describeContract` and the legacy types (`CommonRouteDefinition`, `GetRouteDefinition`, `PayloadRouteDefinition`, `DeleteRouteDefinition`, `*ContractConfig`, `SSEContractDefinition`, `AnySSEContractDefinition`, `DualModeContractDefinition`, `AnyDualModeContractDefinition`, `SSEMethod`, `SSEEventSchemas`, `AllContractEventNames`, `ExtractEventSchema`, `AllContractEvents`). Use `defineApiContract` with `sseResponse()` / `blobResponse()` / a `content` map instead; `SseSchemaByEventName` replaces `SSEEventSchemas`.
- `@lokalise/backend-http-client`: removed `sendByGetRoute`, `sendByPayloadRoute`, `sendByDeleteRoute` and their `*WithStreamedResponse` variants. `sendByContract` is now the same function as `sendByApiContract`.
- `@lokalise/frontend-http-client`: removed `sendByGetRoute`, `sendByPayloadRoute`, `sendByDeleteRoute`, `connectSseByContract` and the `SseCallbacks` / `SseConnection` / `SseRouteRequestParams` types. `sendByContract` is now the same function as `sendByApiContract`; use `sseStreamToCallbacks` for callback-style SSE consumption.
- `@lokalise/fastify-api-contracts`: removed `buildFastifyNoPayloadRoute`, `buildFastifyPayloadRoute`, their `*Handler` variants, `buildFastifyRouteHandler`, `injectGet` / `injectPost` / `injectPut` / `injectPatch` / `injectDelete`, and the `RouteType`, `FastifyPayloadHandlerFn`, `FastifyNoPayloadHandlerFn` types. `buildFastifyRoute` is now the same function as `buildFastifyApiRoute`, and `injectByContract` / `InjectByContractParams` are the same as `injectByApiContract` / `InjectByApiContractParams`. `ApiContractMetadataToRouteMapper` now receives `ApiContract['metadata']`.
- `@lokalise/universal-testing-utils`: removed the legacy `MockttpHelper` / `MswHelper` implementations and their `*MockParams*`, `SseEventController`, `SseMockEvent` types. `MockttpHelper` and `MswHelper` are now the same classes as `ApiContractMockttpHelper` and `ApiContractMswHelper`.

All consumer packages now require `@lokalise/api-contracts@>=9.0.0`.
