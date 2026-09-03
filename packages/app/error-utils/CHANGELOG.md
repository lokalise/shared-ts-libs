# @lokalise/error-utils

## 4.0.0

### Major Changes

- 8fb5c28: Preserve `details` from wrapped errors' `cause` chain when reporting to Bugsnag. Previously, an
  error's own `details` (e.g. an HTTP response body captured on a lower-level `ResponseStatusError`)
  were lost once that error was wrapped as the `cause` of another error, since Bugsnag reporting only
  read the top-level error's `details`. Bugsnag reports now include an `err` metadata field built
  with `pino-std-serializers`' `errWithCause`, carrying the full cause chain along with `details`,
  `errorCode`, and any other custom error properties at every level (replacing the previous flat
  `errorDetails`/`errorCode`/`causeDetails` fields).
  
  `@lokalise/error-utils` now uses the native `Error.isError` and requires Node `>=24.3.0` (declared
  via `engines.node`), a breaking change for consumers on older Node versions.
  
  `AbstractBackgroundJobProcessor` and `AbstractBackgroundJobProcessorNew` no longer serialize
  errors into the `context` passed to the error reporter (dropping the `errorJson`/`error` context
  fields), since Bugsnag reporting now serializes the full error (including `cause`) itself; a
  consumer using a different `ErrorReporter` implementation will see less data in `context` than
  before. Non-`Error` values thrown from `onSuccess`/`onFailed` hooks are still reported via a
  `nonErrorValue` context field, since in that case the `error` passed to the reporter is a synthetic
  placeholder with nothing for a reporter to extract.
