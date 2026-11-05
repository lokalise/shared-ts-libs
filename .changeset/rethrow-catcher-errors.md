---
"@lokalise/frontend-http-client": patch
---

Fix `sendByApiContract` swallowing errors thrown by a client's catchers. When a wretch catcher throws a new error for a non-2xx status, such as an app's own `UnauthorizedError` for a 401, that error now propagates instead of the response being returned as if no catcher had run.
