# Drizzle utils

This package provides reusable helpers for Drizzle ORM.

## Installation

```bash
npm install @lokalise/drizzle-utils
```

Peer dependency: `drizzle-orm` (<2.0.0)

## Usage

### markMigrationsApplied

Sets the Drizzle migration baseline for an existing database.

#### Problem

When migrating from another ORM (e.g. Prisma, TypeORM, Sequelize, or raw SQL migrations) to Drizzle, you face a chicken-and-egg problem:

1. Your database already has the correct schema — tables, columns, indexes, etc. are all in place, created and maintained by the previous ORM.
2. You generate Drizzle migration files from your new Drizzle schema (`drizzle-kit generate`), but these migrations describe creating tables that already exist.
3. Running `drizzle-kit migrate` would fail, because it tries to execute `CREATE TABLE` statements against tables that are already there.

You need a way to tell Drizzle: "these migrations are already reflected in the database — don't run them, just record them as done."

#### Solution

`markMigrationsApplied` populates Drizzle's internal `__drizzle_migrations` tracking table with records for all existing migration files, so that `drizzle-kit migrate` treats them as already applied. This establishes a baseline — from this point forward, only new migrations will be executed.

The function:
- Reads migration files from your migrations folder — supports both the legacy journal format (`meta/_journal.json` with flat SQL files, from drizzle-kit 0.x) and the new folder-per-migration format (`<timestamp>_<name>/migration.sql`, from drizzle-kit 1.0.0-beta)
- Computes the SHA-256 hash for each migration (matching Drizzle's internal algorithm)
- Inserts tracking records into the `__drizzle_migrations` table
- Is **idempotent** — safe to run multiple times; already-tracked migrations are skipped
- Supports **PostgreSQL**, **MySQL**, and **CockroachDB**, with auto-detection from the journal or snapshot files

#### CLI

If you already have a `drizzle.config.ts` with `dbCredentials`, you can run the baseline directly:

```bash
# If @lokalise/drizzle-utils is a project dependency:
npx mark-migrations-applied ./drizzle.config.ts

# Without installing as a dependency:
npx -p @lokalise/drizzle-utils mark-migrations-applied ./drizzle.config.ts
```

For a full step-by-step migration guide, see [Migrating from Prisma to Drizzle](docs/migrating-from-prisma.md).

#### PostgreSQL example (postgres.js)

```typescript
import { markMigrationsApplied } from '@lokalise/drizzle-utils'
import postgres from 'postgres'

const sql = postgres(DATABASE_URL)

const result = await markMigrationsApplied({
  migrationsFolder: './drizzle/migrations',
  executor: {
    run: (query) => sql.unsafe(query).then(() => {}),
    all: (query) => sql.unsafe(query) as Promise<Record<string, unknown>[]>,
  },
})

console.log(`Applied: ${result.applied}, Skipped: ${result.skipped}`)
await sql.end()
```

#### MySQL example (mysql2)

```typescript
import { markMigrationsApplied } from '@lokalise/drizzle-utils'
import mysql from 'mysql2/promise'

const connection = await mysql.createConnection(DATABASE_URL)

const result = await markMigrationsApplied({
  migrationsFolder: './drizzle/migrations',
  executor: {
    run: (query) => connection.execute(query).then(() => {}),
    all: (query) => connection.execute(query).then(([rows]) => rows as Record<string, unknown>[]),
  },
})

console.log(`Applied: ${result.applied}, Skipped: ${result.skipped}`)
await connection.end()
```

#### CockroachDB example (postgres.js)

CockroachDB uses the PostgreSQL wire protocol, so you use the same `postgres` driver:

```typescript
import { markMigrationsApplied } from '@lokalise/drizzle-utils'
import postgres from 'postgres'

const sql = postgres(COCKROACHDB_URL)

const result = await markMigrationsApplied({
  migrationsFolder: './drizzle/migrations',
  executor: {
    run: (query) => sql.unsafe(query).then(() => {}),
    all: (query) => sql.unsafe(query) as Promise<Record<string, unknown>[]>,
  },
  // dialect is auto-detected from the journal, or set explicitly:
  // dialect: 'cockroachdb',
})

console.log(`Applied: ${result.applied}, Skipped: ${result.skipped}`)
await sql.end()
```

#### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `migrationsFolder` | `string` | *(required)* | Path to the Drizzle migrations folder. Supports both legacy format (with `meta/_journal.json`) and new folder-per-migration format (drizzle-kit 1.0.0-beta) |
| `executor` | `SqlExecutor` | *(required)* | Object with `run(sql)` and `all(sql)` methods for executing raw SQL |
| `dialect` | `'postgresql' \| 'mysql' \| 'cockroachdb'` | *(auto-detected)* | Database dialect. Auto-detected from the journal or snapshot files if omitted |
| `migrationsTable` | `string` | `'__drizzle_migrations'` | Name of the migrations tracking table |
| `migrationsSchema` | `string` | `'drizzle'` | Schema for the migrations table (PostgreSQL and CockroachDB only) |

#### Helper functions

`detectMigrationFormat(migrationsFolder)` — returns `'journal'` (legacy format with `meta/_journal.json`) or `'folder'` (new folder-per-migration format).

`readMigrationJournal(migrationsFolder)` — reads and parses `meta/_journal.json` (legacy format only).

`readMigrationEntries(migrationsFolder)` — reads all migration entries with their computed SHA-256 hashes. Automatically detects and handles both legacy and new formats.

`computeMigrationHash(sqlContent)` — computes the SHA-256 hash of a migration SQL string, matching Drizzle's internal algorithm.

---

### snapshotSchema + diffSchemaSnapshots

Tools for verifying that a fresh `drizzle-kit migrate` against an empty database actually reconstructs the same schema as the original (e.g. Prisma-managed) database.

#### Problem

`markMigrationsApplied` tells Drizzle "these migrations are already applied." But that claim is only honest if running those migrations from scratch would produce a structurally identical database. If your Drizzle schema lacks explicit name overrides for constraints, indexes, and FKs, the migrations will generate Drizzle's default names — different from what Prisma named them. The baseline is then a lie: production has `Bundle_projectId_fkey`, a new dev's local DB has `bundle_project_id_bundle_id_fk`, and any code path that references constraint names breaks differently across environments.

#### Solution

Build the same schema twice — once via your old ORM, once via `drizzle-kit migrate` — then snapshot both and diff. **Any difference is a real defect** in the Drizzle schema definition that needs to be fixed (usually by adding the right `name:` override on a constraint or index) *before* you trust `markMigrationsApplied`.

The comparison is strict and not normalized — names are part of the schema. Column ordering is the only thing not enforced (columns are keyed by name, not by ordinal position).

Supported dialects: **PostgreSQL**, **MySQL**, **CockroachDB** (uses the PostgreSQL path).

#### Example

```typescript
import { snapshotSchema, diffSchemaSnapshots } from '@lokalise/drizzle-utils'
import postgres from 'postgres'

const prismaSql = postgres(PRISMA_BUILT_DATABASE_URL)
const drizzleSql = postgres(DRIZZLE_BUILT_DATABASE_URL)

const toExecutor = (sql) => ({
  run: (q) => sql.unsafe(q).then(() => {}),
  all: (q) => sql.unsafe(q),
})

const before = await snapshotSchema({
  executor: toExecutor(prismaSql),
  dialect: 'postgresql',
})
const after = await snapshotSchema({
  executor: toExecutor(drizzleSql),
  dialect: 'postgresql',
})

const diff = diffSchemaSnapshots(before, after)
if (!diff.equal) {
  console.error('Schema mismatch — fix the Drizzle schema before marking migrations applied:')
  for (const d of diff.differences) {
    console.error(`  [${d.kind}] ${d.path}`)
    if (d.kind === 'changed') console.error(`     before: ${JSON.stringify(d.before)}`)
    if (d.kind === 'changed') console.error(`     after:  ${JSON.stringify(d.after)}`)
  }
  process.exit(1)
}
```

A natural CI flow: spin up two databases via docker-compose — one with the existing Prisma migrations applied, one with `drizzle-kit migrate` run against an empty DB — then snapshot and diff. Local-only; no production runtime impact.

#### What is captured

| Element | PostgreSQL / CockroachDB | MySQL |
|---|---|---|
| Tables | ✅ | ✅ |
| Columns (type, nullable, default, identity, generated) | ✅ | ✅ (extra: auto_increment etc.) |
| Primary keys (with name) | ✅ | ✅ (name always `PRIMARY` in MySQL) |
| Unique constraints (with name) | ✅ | ✅ |
| Foreign keys (with name, ON UPDATE, ON DELETE) | ✅ | ✅ |
| Check constraints (with name and expression) | ✅ | ✅ (MySQL 8.0.16+) |
| Indexes (with name, columns, unique, method, partial predicate) | ✅ | ✅ (no partial predicates) |
| Enums | ✅ | ❌ (MySQL enums are column types — captured in column type) |
| Sequences | ✅ | ❌ (MySQL uses auto_increment) |

**Not captured in v1** (scoping decision — not because they don't matter):

- **Views** and **materialized views** — both Drizzle (`pgView`, `pgMaterializedView`, `mysqlView`) and Prisma support these natively. If your schema declares views, this tool will not catch differences in them.
- **Functions, triggers, stored procedures** — no ORM DSL, but commonly added via raw-SQL migration files (e.g. the `updated_at` trigger pattern in the [Prisma → Drizzle guide](docs/migrating-from-prisma.md#prisma-updatedat-columns)). If your migrations declare them, divergence will not surface here.
- **Domains** (PostgreSQL) — genuinely rare in ORM-managed schemas.

Adding any of these is a reasonable follow-up; the snapshot type is structured to extend without breaking existing consumers.

#### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `executor` | `SqlExecutor` | *(required)* | Object with `run(sql)` and `all(sql)` — same shape as for `markMigrationsApplied` |
| `dialect` | `'postgresql' \| 'mysql' \| 'cockroachdb'` | *(required)* | Database dialect |
| `schemas` | `string[]` | PG: `['public']`; MySQL: current database | Schemas to capture |
| `excludeTables` | `string[]` | `['__drizzle_migrations', '_prisma_migrations']` | Tables to skip (by unqualified name). Override to add your own |

#### Diff result

`diffSchemaSnapshots` returns `{ equal: boolean, differences: SnapshotDifference[] }` where each difference has a dotted `path` (e.g. `schemas.public.tables.users.columns.email.type`) and a `kind` of `'added'`, `'removed'`, or `'changed'`. The output is stable and sorted, suitable for snapshot testing.

---

### drizzleFullBulkUpdate

Performs efficient bulk updates using a single SQL query with a `VALUES` clause. This is more efficient than executing multiple individual UPDATE statements and more effective than INSERT ON CONFLICT UPDATE (UPSERT) for update-only operations.

```typescript
import { drizzleFullBulkUpdate } from '@lokalise/drizzle-utils'
import { drizzle } from 'drizzle-orm/postgres-js'
import { pgTable, smallint, text } from 'drizzle-orm/pg-core'

const db = drizzle(connectionString)

const users = pgTable('users', {
  id: smallint('id').primaryKey(),
  name: text('name'),
  age: smallint('age'),
})

// Update multiple rows in a single query
await drizzleFullBulkUpdate(db, users, [
  { where: { id: 1 }, data: { name: 'Alice', age: 30 } },
  { where: { id: 2 }, data: { name: 'Bob', age: 25 } },
  { where: { id: 3 }, data: { name: 'Charlie', age: 35 } },
])
```

This generates an efficient SQL query of the form:

```sql
UPDATE "public"."users" AS tbl
SET "name" = updates."name"::smallint, "age" = updates."age"::smallint
FROM (
  VALUES
    (1, 'Alice', 30),
    (2, 'Bob', 25),
    (3, 'Charlie', 35)
) AS updates("id", "name", "age")
WHERE tbl."id" = updates."id"::smallint
```

#### Features

- **Efficient bulk updates**: All updates are performed in a single SQL query
- **Type-safe**: Fully typed with TypeScript and Drizzle schema definitions
- **Composite key support**: Works with both single and composite primary keys
- **JSON support**: Handles JSON/JSONB columns correctly
- **Transactional**: The entire bulk update is atomic - either all updates succeed or all are rolled back

#### Constraints

- The `entries` array must not be empty
- All `where` objects must have the same set of keys
- All `data` objects must have the same set of keys
- Both `where` and `data` objects must not be empty

#### Concurrency Behavior

**Best Practice**: Use unique columns (primary keys, unique constraints) in the `where` clause to ensure each entry targets a different row. This avoids race conditions and provides predictable behavior.

When multiple bulk updates target the same rows concurrently, behavior depends on PostgreSQL's isolation level:

- **READ COMMITTED (default)**: Concurrent updates to different columns on the same row will succeed. Updates to the same column may result in lost updates (one overwrites the other).
- **REPEATABLE READ / SERIALIZABLE**: Concurrent updates may fail with serialization errors and require retry logic.

#### Composite Key Example

```typescript
const orderItems = pgTable('order_items', {
  orderId: smallint('order_id'),
  itemId: smallint('item_id'),
  quantity: smallint('quantity'),
  price: smallint('price'),
})

await drizzleFullBulkUpdate(db, orderItems, [
  { where: { orderId: 1, itemId: 1 }, data: { quantity: 5, price: 100 } },
  { where: { orderId: 1, itemId: 2 }, data: { quantity: 3, price: 75 } },
])
```
