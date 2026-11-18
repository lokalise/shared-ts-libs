---
"@lokalise/backend-http-client": minor
---

New `buildPool(baseUrl, { connections, ...poolOptions })` returns an undici `Pool` of up to `connections` connections (a positive integer), so concurrent requests over HTTP/1.1 run in parallel instead of one at a time, by default, on the single connection a `buildClient()` client has. Over HTTP/2, which undici negotiates with HTTPS servers that support it, one connection already carries concurrent requests and a pool stays on it; when concurrent responses are large, `allowH2: false` spreads requests over several HTTP/1.1 connections, which can be much faster.

Every request helper now accepts a `Client` or a `Pool`, typed as the new `HttpDispatcher`. `HttpClient` and `buildClient()` are unchanged.
