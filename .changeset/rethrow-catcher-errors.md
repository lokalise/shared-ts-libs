---
"@lokalise/frontend-http-client": patch
---

Fix `sendByApiContract` swallowing errors thrown by a client's catchers. When a wretch catcher throws its own error for a non-2xx status, such as an app's `UnauthorizedError` for a 401, that error now propagates. Before, the response was returned as if no catcher had run. A catcher that rethrows the error wretch gave it still gets the response parsed.
