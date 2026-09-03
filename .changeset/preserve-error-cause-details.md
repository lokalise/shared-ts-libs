---
'@lokalise/error-utils': patch
'@lokalise/background-jobs-common': patch
---

Preserve `details` from wrapped errors' `cause` chain when reporting to Bugsnag and when
serializing errors for logging in background job processors. Previously, an error's own `details`
(e.g. an HTTP response body captured on a lower-level `ResponseStatusError`) were lost once that
error was wrapped as the `cause` of another error, since Bugsnag reporting only read the top-level
error's `details` and job processors serialized errors with `pino.stdSerializers.err`, which drops
`cause` entirely. Bugsnag reports now include a `causeDetails` array with each cause's `details`,
and job processors now use `pino.stdSerializers.errWithCause` to keep the full cause chain (and its
custom fields) in logged `errorJson`.
