---
"@lokalise/backend-http-client": patch
"@lokalise/frontend-http-client": patch
"@lokalise/universal-testing-utils": patch
---

Accept contracts compiled against older `@lokalise/api-contracts` versions. Every contract input
(HTTP client senders, SSE connector, and mock helpers) now loosens the server-only `visibility`
field to optional via `ClientCompatibleContract`, so contracts whose types predate the field
(<7.2) keep working. The clients and testing helpers never read server-only fields; they only
matter on the serving side.
