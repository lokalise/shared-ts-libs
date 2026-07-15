# @lokalise/drizzle-utils

## 2.0.0

### Major Changes

- d2e5877: `markMigrationsApplied` now drives all queries through a Drizzle `db` instance instead of a `SqlExecutor`, making it driver-agnostic (mysql2, postgres-js, …). It still reads both the legacy journal and folder-per-migration formats and supports a custom `migrationsSchema` (PostgreSQL/CockroachDB), and additionally populates the `name` column required by drizzle-orm >= 1.0.0-rc, can create the database (`databaseName`), and short-circuits on a fresh database (`legacySchemaProbeTable`). The `mark-migrations-applied` CLI is unchanged in usage but now builds a Drizzle instance internally.

  BREAKING CHANGE: `markMigrationsApplied` no longer accepts an `executor: SqlExecutor`. Pass a Drizzle instance instead: `markMigrationsApplied({ db, migrationsFolder })`. The result shape is now `{ outcome, total, applied, skipped }`.

## 1.3.1

### Patch Changes

- ef406ef: Fix drizzleFullBulkUpdate rejecting Date values: timestamp/date/time columns now serialize Date to an ISO-8601 string before the explicit VALUES cast, in both `where` and `data` columns.

## 1.3.0

### Minor Changes

- dafe9db: Add DB schema snapshotting and diffing utilities (`snapshotSchema`, `diffSchemaSnapshots`) for PostgreSQL and MySQL, to support comparing schemas before and after Drizzle migrations.
