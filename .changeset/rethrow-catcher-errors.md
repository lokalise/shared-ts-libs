---
"@lokalise/frontend-http-client": patch
---

Fix `sendByApiContract` swallowing new errors a client's catchers throw. When a wretch catcher throws a new error for a non-2xx status, such as an app's `UnauthorizedError` for a 401, that error now propagates. Before, the response was returned as if no catcher had run. When a catcher rethrows the error it was given, or throws a wretch HTTP error, this request's last error response is still parsed. Discarding an unused error response no longer causes an unhandled rejection.
