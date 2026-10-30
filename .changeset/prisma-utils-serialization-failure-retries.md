---
"@lokalise/prisma-utils": minor
---

Added `retryOnSerializationFailure`, which retries a single statement with exponential backoff while it fails with a serialization failure and rethrows anything else immediately. Unlike `prismaTransaction` it adds no surrounding transaction, so a single read keeps CockroachDB's server-side refresh and costs no extra round trip; it is only safe around a single read-only statement.

Fixed `isCockroachDBRetryTransaction`, which now also recognises the CockroachDB retry error reported by a Prisma driver adapter (`@prisma/adapter-pg`), arriving as `P2010` with the SQLSTATE nested under `meta.driverAdapterError.cause.originalCode` instead of a flat `meta.code`. On Prisma 7 with a driver adapter `prismaTransaction` silently stopped retrying these, so retriable CockroachDB conflicts surfaced to callers on the first attempt.
