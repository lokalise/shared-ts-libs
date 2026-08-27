---
"@lokalise/fastify-api-contracts": patch
---

Keep a committed SSE stream open when an error escapes the route handler after `sse.start()`, instead of letting `@fastify/sse` close the connection before rethrowing. The error now reaches the global error handler with the stream still connected, so an SSE-aware error handler can serialize it into a terminal error event and close the stream (reported as a server-initiated close to `onClose`). Errors thrown before the stream starts still produce a regular HTTP error response.
