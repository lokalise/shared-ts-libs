---
"@lokalise/prisma-utils": minor
---

Added `retryOnSerializationFailure`, which retries a single statement with exponential backoff while it fails with a serialization failure (Prisma `P2034` or SQLSTATE 40001, in both the query engine and driver adapter shapes) and rethrows anything else immediately. Unlike `prismaTransaction` it adds no surrounding transaction, so a single read keeps CockroachDB's server-side refresh and costs no extra round trip. It is only safe around a single read-only statement.
