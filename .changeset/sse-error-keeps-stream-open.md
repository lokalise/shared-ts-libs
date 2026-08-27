---
"@lokalise/fastify-api-contracts": patch
---

Keep a committed SSE stream open when an error escapes the route handler after `sse.start()`, instead of letting `@fastify/sse` close the connection before rethrowing. The error now reaches the global error handler with the stream still connected, so an SSE-aware error handler can serialize it into a terminal error event and close the stream. Errors thrown before the stream starts still produce a regular HTTP error response.

The `onClose` initiator is now attributed when the stream actually closes: any server-initiated close — `session.close()`, an error handler calling `reply.sse.close()`, or `@fastify/sse` closing an `autoClose` session after the handler completes — reports `'server'` (previously a direct `reply.sse.close()` reported `'client'`), while a client disconnect keeps reporting `'client'` even after a handler error.
