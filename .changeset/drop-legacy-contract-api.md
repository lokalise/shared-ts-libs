---
"@lokalise/api-contracts": major
"@lokalise/backend-http-client": major
"@lokalise/frontend-http-client": major
"@lokalise/fastify-api-contracts": major
"@lokalise/universal-testing-utils": major
---

Remove the deprecated contract definition API. `defineApiContract` is now the only way to define a contract; the `*ApiContract` functions in the client, server and testing packages are the only way to consume one.

- `@lokalise/api-contracts`: removed `buildGetRoute`, `buildPayloadRoute`, `buildDeleteRoute`, `buildRestContract`, `buildContract`, `buildSseContract`, `mapRouteToPath`, `describeContract` and the legacy types (`CommonRouteDefinition`, `GetRouteDefinition`, `PayloadRouteDefinition`, `DeleteRouteDefinition`, `*ContractConfig`, `SSEContractDefinition`, `AnySSEContractDefinition`, `DualModeContractDefinition`, `AnyDualModeContractDefinition`, `SSEMethod`, `SSEEventSchemas`, `AllContractEventNames`, `ExtractEventSchema`, `AllContractEvents`). Use `defineApiContract` with `sseResponse()` / `blobResponse()` / a `content` map instead; `SseSchemaByEventName` replaces `SSEEventSchemas`.
- `@lokalise/backend-http-client`: removed `sendByGetRoute`, `sendByPayloadRoute`, `sendByDeleteRoute` and their `*WithStreamedResponse` variants.  Use `sendByApiContract`.
- `@lokalise/frontend-http-client`: removed `sendByGetRoute`, `sendByPayloadRoute`, `sendByDeleteRoute`, `connectSseByContract` and the `SseCallbacks` / `SseConnection` / `SseRouteRequestParams` types. Use `sendByApiContract`, and `sseStreamToCallbacks` for callback-style SSE consumption. The plain `sendGet` / `sendPost` / `sendPut` / `sendPatch` / `sendDelete` now type `headers` as an object or a sync/async factory, matching `sendByApiContract`.
- `@lokalise/fastify-api-contracts`: removed `buildFastifyRoute`, `buildFastifyRouteHandler`, `buildFastifyNoPayloadRoute`, `buildFastifyPayloadRoute`, their `*Handler` variants, `injectByContract`, `InjectByContractParams`, `injectGet` / `injectPost` / `injectPut` / `injectPatch` / `injectDelete`, and the `RouteType`, `FastifyPayloadHandlerFn`, `FastifyNoPayloadHandlerFn` types. Use `buildFastifyApiRoute` and `injectByApiContract`. `ApiContractMetadataToRouteMapper` now receives `ApiContract['metadata']`. The Fastify `FastifyContextConfig.apiContract` augmentation is now optional, since routes registered without `buildFastifyApiRoute` do not carry it; hooks reading it must narrow first.
- `@lokalise/universal-testing-utils`: removed `MockttpHelper`, `MswHelper` and their `*MockParams*`, `SseEventController`, `SseMockEvent` types. Use `ApiContractMockttpHelper` and `ApiContractMswHelper`.

`RoutePathResolver` (the `pathResolver` field) must now return a path starting with `/`, typed as `` `/${string}` ``. Inline literals and template strings infer correctly; resolvers that return a plain `string` (e.g. from a shared path helper) need to return `` `/${string}` `` instead.

`@lokalise/api-contracts` now exports its type utilities (`Prettify`, `IsUnion`, `Exactly`, `KeysOfUnion`, `DistributiveOmit`, `ValueOf`) and gains framework-agnostic server types next to the client ones: `InferServerRequest`, `InferServerResponse`, `InferServerResponseContentTypes`, `InferServerSseSelections`, `InferServerStatusesForKey`, `ServerSseSelection`, `SseMessage` and `SseStreamMessage`. `@lokalise/fastify-api-contracts` now builds `InferApiHandlerRequest`, `InferApiHandlerResult`, `InferContractResponseContentTypes`, `SSEMessage`, `SSEStreamMessage` and `SSESelection` on top of them; those names are unchanged.

All consumer packages now require `@lokalise/api-contracts@>=9.0.0`.
