---
"@lokalise/backend-http-client": major
---

`buildClient()` accepts `connections`: it then returns an undici `Pool` of up to that many connections, so concurrent requests run in parallel instead of one after another on a single connection. `HttpClient` now covers both `Client` and `Pool`, and every request helper accepts either. Without `connections`, `buildClient()` returns a single-connection `Client` as before.

Breaking for types only: code that passes an `HttpClient` to its own parameters typed as undici's `Client` no longer compiles, since `HttpClient` can now be a `Pool`. Type those parameters as `HttpClient`.
