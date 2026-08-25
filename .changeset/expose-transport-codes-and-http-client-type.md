---
'@lokalise/backend-http-client': minor
---

Export `TRANSPORT_ERROR_CODES` (the authoritative transport-error code list, previously internal) and the `HttpClient` type (the handle returned by `buildClient`), so consumers can iterate the code list instead of copying it and can type client instances without importing `Client` from `undici` directly.
