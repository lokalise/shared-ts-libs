---
"@lokalise/fastify-api-contracts": patch
---

Document error handling for `buildFastifyApiRoute` contract routes in the README: errors follow the regular Fastify error handling chain, and a global `setErrorHandler` serving SSE routes must branch on the live-stream state (`reply.sse?.isConnected && reply.raw.headersSent`) to send a terminal `error` event instead of a status code.
