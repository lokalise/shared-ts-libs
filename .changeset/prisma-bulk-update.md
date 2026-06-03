---
"@lokalise/prisma-utils": minor
---

Add `prismaBulkUpdate`: update many rows in a single atomic SQL statement (one `UPDATE ... FROM (VALUES ...)`), with per-column SQL type casts, optional `RETURNING`, and support for both CockroachDB and PostgreSQL via the `dbDriver` option.