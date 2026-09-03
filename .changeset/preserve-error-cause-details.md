---
'@lokalise/error-utils': major
'@lokalise/background-jobs-common': patch
---

Preserve `details` from wrapped errors' `cause` chain when reporting to Bugsnag and when
serializing errors for logging in background job processors. Previously, an error's own `details`
(e.g. an HTTP response body captured on a lower-level `ResponseStatusError`) were lost once that
error was wrapped as the `cause` of another error, since Bugsnag reporting only read the top-level
error's `details` and job processors serialized errors with `pino.stdSerializers.err`, which drops
`cause` entirely. Bugsnag reports now include an `err` metadata field built with
`pino-std-serializers`' `errWithCause`, carrying the full cause chain along with `details`,
`errorCode`, and any other custom error properties at every level (replacing the previous flat
`errorDetails`/`errorCode`/`causeDetails` fields), and job processors now use
`pino.stdSerializers.errWithCause` to keep the full cause chain (and its custom fields) in logged
`errorJson`.

`@lokalise/error-utils` now uses the native `Error.isError` and requires Node `>=24.3.0`
(declared via `engines.node`), a breaking change for consumers on older Node versions.

`AbstractBackgroundJobProcessor` and `AbstractBackgroundJobProcessorNew` no longer duplicate error
serialization in the `context` passed to the error reporter (`errorJson`/`error` fields), since
Bugsnag reporting now serializes the full error (including `cause`) itself.
