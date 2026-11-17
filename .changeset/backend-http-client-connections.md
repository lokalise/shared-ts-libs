---
"@lokalise/backend-http-client": minor
---

`buildClient()` accepts `connections`: it then returns an undici `Pool` of up to that many connections, so concurrent requests run in parallel instead of one after another on a single connection. `HttpClient` now covers both `Client` and `Pool`, and every request helper accepts either. Without `connections`, `buildClient()` returns a single-connection `Client` as before.
