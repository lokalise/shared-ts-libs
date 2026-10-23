---
"@lokalise/backend-http-client": patch
"@lokalise/fastify-api-contracts": patch
"@lokalise/frontend-http-client": patch
"@lokalise/universal-testing-utils": patch
---

Bound the `@lokalise/api-contracts` peer dependency range to `>=9.0.0 <10.0.0` so installing an incompatible future major surfaces as a peer warning at install time instead of a runtime crash.
