---
"@lokalise/frontend-http-client": patch
---

Fix `sendByApiContract` swallowing errors thrown by a client's catchers. When a wretch catcher throws for a non-2xx status, such as an `UnauthorizedError` for a 401, the error now propagates instead of being replaced by an `UnexpectedResponseError` or an `Either.error` result.
