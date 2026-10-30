---
"@lokalise/prisma-utils": patch
---

`isCockroachDBRetryTransaction` now also recognises the CockroachDB retry error reported by a Prisma driver adapter (`@prisma/adapter-pg`), which arrives as `P2010` with the SQLSTATE nested under `meta.driverAdapterError.cause.originalCode` instead of a flat `meta.code`. On Prisma 7 with a driver adapter `prismaTransaction` silently stopped retrying these, so retriable CockroachDB conflicts surfaced to callers on the first attempt.
