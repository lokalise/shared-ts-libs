---
"@lokalise/frontend-http-client": patch
---

Fix `sendByApiContract` swallowing errors thrown by a client's catchers. When a wretch catcher throws a new error for a non-2xx status, such as an app's `UnauthorizedError` for a 401, that error now propagates. Before, the response was returned as if no catcher had run. When a catcher passes on the error it was given, or throws a wretch HTTP error, the response is still parsed.
