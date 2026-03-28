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
- Reads the migration journal (`meta/_journal.json`) and SQL files from your migrations folder
- Computes the SHA-256 hash for each migration (matching Drizzle's internal algorithm)
- Inserts tracking records into the `__drizzle_migrations` table
- Is **idempotent** — safe to run multiple times; already-tracked migrations are skipped
- Supports **PostgreSQL**, **MySQL**, and **CockroachDB**, with auto-detection from the journal

#### CLI

If you already have a `drizzle.config.ts` with `dbCredentials`, you can run the baseline directly:

```bash
npx @lokalise/drizzle-utils mark-migrations-applied ./drizzle.config.ts
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
| `migrationsFolder` | `string` | *(required)* | Path to the Drizzle migrations folder (containing `meta/_journal.json`) |
| `executor` | `SqlExecutor` | *(required)* | Object with `run(sql)` and `all(sql)` methods for executing raw SQL |
| `dialect` | `'postgresql' \| 'mysql' \| 'cockroachdb'` | *(auto-detected)* | Database dialect. Auto-detected from the journal's `dialect` field if omitted |
| `migrationsTable` | `string` | `'__drizzle_migrations'` | Name of the migrations tracking table |
| `migrationsSchema` | `string` | `'drizzle'` | Schema for the migrations table (PostgreSQL and CockroachDB only) |

#### Helper functions

`readMigrationJournal(migrationsFolder)` — reads and parses `meta/_journal.json`.

`readMigrationEntries(migrationsFolder)` — reads all migration entries with their computed SHA-256 hashes.

`computeMigrationHash(sqlContent)` — computes the SHA-256 hash of a migration SQL string, matching Drizzle's internal algorithm.

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
