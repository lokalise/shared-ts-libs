---
"@lokalise/fastify-api-contracts": minor
---

Add `buildFastifyRouteByApiContract` and `buildFastifyRouteHandlerByApiContract` builders compatible with `defineApiContract` contracts. They derive the route method, URL, request schemas and response schema from the contract and infer the handler request/reply types, mirroring `buildFastifyRoute`/`buildFastifyRouteHandler` for the deprecated contract builders.
