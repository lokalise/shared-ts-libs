---
"@lokalise/frontend-http-client": patch
---

Fix `sendByApiContract` swallowing errors a client's catchers throw. When a wretch catcher throws its own error for a non-2xx status, like an app's `UnauthorizedError` on a 401, that error now reaches the caller. Before, the response was returned as if no catcher had run. Only a wretch HTTP error or a `Response` is still parsed into an `Either`. A wretch HTTP error is any value with `response`, `status` and `url`. So when `retry` runs out of attempts without `resolveWithLatestResponse: true`, its error is now thrown instead of the last response being returned. Discarding an unused error response no longer causes an unhandled rejection.
