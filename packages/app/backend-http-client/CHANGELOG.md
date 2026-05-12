# Changelog

## [11.0.0] - 2026-05-08

### Remove `undici-retry` dependency

Replace `undici-retry` with an internal retry implementation. The following exports are removed:

- `DelayResolver` (type)
- `DEFAULT_RETRY_CONFIG`
- `createDefaultRetryResolver`
- `SendByApiContractRetryConfig` (type alias — use `RetryConfig` instead)

### `RetryConfig` shape changed

Migrate all `retryConfig` usages to the new field names:

| Before | After |
|---|---|
| `maxAttempts` | `maxRetries` |
| `statusCodesToRetry` | `statusCodes` |
| `delayResolver` | `delay: (retryNumber: number) => number` |
| `retryOnTimeout` | `retryOnTimeout?` (default `true`) |
| — | `maxDelay?` (default `30_000`) |
| — | `maxJitter?` (default `100`) |
| — | `respectRetryAfter?` (default `true`) |
| — | `retryOnNetworkError?` (default `true`) |

Pass `retryConfig: true` to enable retries with all defaults applied. Retries are now opt-in — no retries are performed unless `retryConfig` is explicitly set.

### `InternalRequestError` is now a class

`InternalRequestError` was previously a plain type intersection (`Error & { isInternalRequestError: true }`). It is now a class extending `Error`:

- The `isInternalRequestError: true` property is removed — use `instanceof InternalRequestError` or the exported `isInternalRequestError(err)` type guard
- `err.message` reflects the underlying cause's message when the cause is an `Error`
- `err.cause` holds the original error
- `InternalRequestError` is now a named export from the package root
- Cross-realm `instanceof` is supported via a `Symbol.for` brand

### `ResponseParseError` is now a public export

`ResponseParseError` is promoted from an internal class to a named export from the package root. Cross-realm `instanceof` is supported via a `Symbol.for` brand.
