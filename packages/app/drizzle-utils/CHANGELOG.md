# @lokalise/drizzle-utils

## 1.3.1

### Patch Changes

- ef406ef: Fix drizzleFullBulkUpdate rejecting Date values: timestamp/date/time columns now serialize Date to an ISO-8601 string before the explicit VALUES cast, in both `where` and `data` columns.

## 1.3.0

### Minor Changes

- dafe9db: Add DB schema snapshotting and diffing utilities (`snapshotSchema`, `diffSchemaSnapshots`) for PostgreSQL and MySQL, to support comparing schemas before and after Drizzle migrations.
