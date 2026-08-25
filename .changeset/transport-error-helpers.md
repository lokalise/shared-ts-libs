---
'@lokalise/backend-http-client': minor
---

Add `isTransportError` and `getTransportErrorCode` helpers detecting transport-level request failures without an HTTP response (undici timeouts and socket errors, connection refused/reset, DNS backoff), including errors wrapped in a `cause` chain. Useful for classifying such failures as retryable.
