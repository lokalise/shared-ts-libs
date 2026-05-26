---
"@lokalise/api-contracts": minor
---

Add support for wildcard status code keys (`'1xx'`–`'5xx'`) and `'default'` in `responsesByStatusCode`, aligning with OpenAPI and Fastify conventions.

Lookup precedence: exact code → range key → `'default'`. The `'2xx'` range participates in SSE-mode detection and success/error type narrowing the same way explicit 2xx codes do.
