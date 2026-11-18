---
"@lokalise/backend-http-client": major
---

New `buildPool(baseUrl, { connections, ...clientOptions })` returns an undici `Pool` of up to `connections` connections (a positive integer), so concurrent requests over HTTP/1.1 run in parallel instead of one at a time on the single connection a `buildClient()` client has. Over HTTP/2, which undici negotiates with HTTPS servers that support it, one connection already carries concurrent requests; a pool still helps when a batch moves a lot of data, most with `allowH2: false`, which spreads requests over several HTTP/1.1 connections.

Breaking for types only: `HttpClient` is now `Client | Pool`, and every request helper accepts either. Code that passes an `HttpClient` to its own parameters typed as undici's `Client` no longer compiles; type those parameters as `HttpClient`. `buildClient()` itself is unchanged.
