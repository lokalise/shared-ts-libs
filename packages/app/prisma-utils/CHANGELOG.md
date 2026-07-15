# @lokalise/prisma-utils

## 6.1.0

### Minor Changes

- 65ff0e9: Add `prismaBulkUpdate`: update many rows in a single atomic SQL statement (one `UPDATE ... FROM (VALUES ...)`), with per-column SQL type casts, optional `RETURNING`, and support for both CockroachDB and PostgreSQL via the `dbDriver` option.
