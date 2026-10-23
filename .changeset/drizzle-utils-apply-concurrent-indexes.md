---
"@lokalise/drizzle-utils": minor
---

Added `applyConcurrentIndexes` and the `apply-concurrent-indexes` CLI, which build PostgreSQL indexes with `CREATE INDEX CONCURRENTLY` before `drizzle-kit migrate`. Valid indexes are skipped, INVALID ones left by a failed build are rebuilt, and indexes on tables that do not exist yet are skipped.
