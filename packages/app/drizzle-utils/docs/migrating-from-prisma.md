# Migrating from Prisma to Drizzle

This is the recommended workflow when migrating from Prisma. The same approach applies to any ORM.

## Step 1: Install Drizzle

```bash
npm install drizzle-orm drizzle-kit
```

## Step 2: Create your Drizzle schema

You have three options:

- **Introspect from the database** (recommended): Run `npx drizzle-kit introspect` to generate a Drizzle schema from your existing database. This is the safest option because it reflects the actual database state, not the Prisma schema which may have drifted.
- **Convert from Prisma schema manually**: Rewrite your `schema.prisma` models as Drizzle table definitions. Be careful to match column types, defaults, and constraints exactly.
- **Use a Prisma generator**: Community tools like [`prisma-generator-drizzle`](https://github.com/fdarian/prisma-generator-drizzle) can generate a Drizzle schema from your `schema.prisma`, but always review the output.

See also: [Drizzle official guide — Migrate from Prisma](https://orm.drizzle.team/docs/migrate/migrate-from-prisma)

## Step 3: Configure `drizzle.config.ts`

```typescript
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql', // or 'mysql', 'cockroachdb'
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
```

## Step 4: Generate the initial migration

```bash
npx drizzle-kit generate
```

This produces SQL migration files that describe your full schema (`CREATE TABLE`, etc.). These describe the *target state*, which your database already has — they must NOT be executed directly.

The output format depends on your drizzle-kit version:
- **drizzle-kit 0.x (stable)**: flat SQL files with a `meta/_journal.json` index
- **drizzle-kit 1.0.0-beta**: folder-per-migration (`<timestamp>_<name>/migration.sql`)

Both formats are fully supported by `markMigrationsApplied`.

Review the generated SQL to verify it matches your existing database. If there are differences, fix your Drizzle schema and regenerate.

## Step 5: Mark migrations as applied (the baseline)

Since your `drizzle.config.ts` already has the connection details and migrations folder, just run the CLI:

```bash
# If @lokalise/drizzle-utils is a project dependency:
npx mark-migrations-applied ./drizzle.config.ts

# Without installing as a dependency:
npx -p @lokalise/drizzle-utils mark-migrations-applied ./drizzle.config.ts
```

The CLI reads `dialect`, `dbCredentials`, and `out` from your config, connects to the database, and marks all existing migrations as applied.

Run this **once per environment** (local, staging, production). The command is idempotent, so running it again is safe — already-tracked migrations are skipped.

<details>
<summary>Alternative: use the function directly in a script</summary>

If you need more control (e.g. custom table name, schema, or executor), create a one-time script:

```typescript
import { markMigrationsApplied } from '@lokalise/drizzle-utils'
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL!)

const result = await markMigrationsApplied({
  migrationsFolder: './drizzle/migrations',
  executor: {
    run: (query) => sql.unsafe(query).then(() => {}),
    all: (query) => sql.unsafe(query) as Promise<Record<string, unknown>[]>,
  },
})

console.log(`Baseline complete — Applied: ${result.applied}, Skipped: ${result.skipped}`)
await sql.end()
```

</details>

## Step 6: Verify the baseline

```bash
npx drizzle-kit migrate
```

This should be a **no-op** — all migrations are already tracked, so nothing is executed. If Drizzle tries to run migrations here, your baseline was not applied correctly.

## Step 7: Remove Prisma and deploy

- Remove `prisma` and `@prisma/client` from your dependencies
- Delete `schema.prisma` and the `prisma/` migrations folder
- Replace all `PrismaClient` usage with Drizzle queries
- Clean up references in `.gitignore`, `dependabot.yml`, Dockerfile, CI workflows, and deployment scripts
- Drop the `_prisma_migrations` table when you are confident the migration is complete

From this point on, all new schema changes go through the normal Drizzle workflow:

```bash
# Edit your Drizzle schema, then:
npx drizzle-kit generate   # generates a new migration
npx drizzle-kit migrate    # applies only the new migration
```

## Prisma `@updatedAt` columns

Prisma's `@updatedAt` directive sets the timestamp at the **ORM level**, not the database level — the database has no trigger or default to update the column automatically. This means:

- Raw SQL updates (e.g. via `sql.unsafe(...)` or bulk operations) will **not** update the `updated_at` column.
- Other tools or services that write directly to the database will also skip it.

When migrating to Drizzle, you have two options:

### Option 1: ORM-level (matches Prisma behavior)

Use Drizzle's `.$onUpdate()` to set the timestamp when using the Drizzle query builder:

```typescript
import { timestamp } from 'drizzle-orm/pg-core'

const myTable = pgTable('my_table', {
  // ...
  updatedAt: timestamp('updated_at', { withTimezone: true }).$onUpdate(() => new Date()),
})
```

This has the same limitation as Prisma — raw SQL updates won't trigger it. Additionally, `$onUpdate()` only fires on `.update()` calls, **not** on `.insert()`. If the column is `NOT NULL`, you must provide the value explicitly in insert operations (including test fixtures).

### Option 2: Database-level trigger (recommended)

Add a trigger so the database updates the column automatically, regardless of how the write happens:

```sql
-- Create the trigger function (once per database)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach to each table that has an updated_at column
CREATE TRIGGER trg_set_updated_at
    BEFORE UPDATE ON my_table
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
```

This is the safer option — it works for Drizzle queries, raw SQL, and any other database client.

You can add the trigger as a new Drizzle migration after the baseline is established.

## Important notes

- **Run the baseline before `drizzle-kit migrate`**: If you run `migrate` first, Drizzle will attempt to execute `CREATE TABLE` statements and fail.
- **Schema drift**: If your Prisma schema and actual database have drifted apart, use `drizzle-kit introspect` rather than converting from Prisma — the database is the source of truth.
- **Parallel ORM usage**: During the transition you can run Prisma and Drizzle side-by-side. Just make sure all new migrations go through one ORM only (Drizzle) to avoid conflicts.
- **CI/CD**: Add the baseline script to your deployment pipeline so it runs before `drizzle-kit migrate`. Since it's idempotent, it's safe to run on every deploy.

## Practical migration guide: query patterns

This section covers the real-world patterns you will encounter when converting Prisma queries to Drizzle, based on production migrations.

### Recommended file structure

```
src/db/
  schema.ts      # Table definitions (from introspect, then refined)
  relations.ts   # Drizzle relation definitions (defineRelations)
  client.ts      # createDbClient() factory, DbClient and DbTransaction type exports
  types.ts       # InferSelectModel/InferInsertModel re-exports, composite types
drizzle/
  <migrations>   # Generated by drizzle-kit generate
drizzle.config.ts
```

### Creating the client

```typescript
// src/db/client.ts
import { drizzle } from 'drizzle-orm/mysql2'  // or /postgres, etc.
import mysql from 'mysql2/promise'
import { relations } from './relations.js'
import * as schema from './schema.js'

export function createDbClient(databaseUrl: string) {
  // timezone: 'Z' is critical — see "mysql2 DATE columns and timezone" gotcha below
  const pool = mysql.createPool({ uri: databaseUrl, timezone: 'Z' })
  return drizzle({ client: pool, schema, relations })
}

export type DbClient = ReturnType<typeof createDbClient>
export type DbTransaction = Parameters<Parameters<DbClient['transaction']>[0]>[0]
```

### Type exports

Prisma generates model types like `Bundle`, `Project`, etc. In Drizzle, derive them from the schema:

```typescript
// src/db/types.ts
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'
import type { bundle, project, team } from './schema.js'

export type Bundle = InferSelectModel<typeof bundle>
export type Project = InferSelectModel<typeof project>
export type Team = InferSelectModel<typeof team>

export type BundleInsert = InferInsertModel<typeof bundle>

// Composite types (replaces Prisma.ProjectGetPayload<{ include: { Team: true } }>)
export type ProjectWithTeam = Project & { Team: Team }
```

### Query pattern reference

#### CRUD operations

```typescript
// Prisma: prisma.bundle.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } })
// Drizzle:
db.select().from(bundle).where(eq(bundle.projectId, projectId)).orderBy(desc(bundle.createdAt))

// Prisma: prisma.bundle.findFirst({ where: { id, projectId } })
// Drizzle (returns T | undefined, not T | null):
const results = await db.select().from(bundle)
  .where(and(eq(bundle.id, id), eq(bundle.projectId, projectId)))
  .limit(1)
return results[0] ?? null

// Prisma: prisma.bundle.findUnique({ where: { externalId } })
// Drizzle (no findUnique — just select with limit):
const results = await db.select().from(team)
  .where(eq(team.externalId, externalId))
  .limit(1)

// Prisma: prisma.bundle.create({ data })
// Drizzle (MySQL — no .returning(), use .$returningId() + select):
const [inserted] = await db.insert(bundle).values(data).$returningId()
const [row] = await db.select().from(bundle).where(eq(bundle.id, inserted.id)).limit(1)
// PostgreSQL has .returning() which avoids the extra select.

// Prisma: prisma.bundle.update({ where: { id }, data })
// Drizzle (MySQL — update doesn't return the row):
await db.update(bundle).set(data).where(eq(bundle.id, id))
const [row] = await db.select().from(bundle).where(eq(bundle.id, id)).limit(1)

// Prisma: prisma.bundle.delete({ where: { id } })
// Drizzle (MySQL — delete doesn't return the row, select first):
const [row] = await db.select().from(bundle).where(eq(bundle.id, id)).limit(1)
await db.delete(bundle).where(eq(bundle.id, id))
return row

// Prisma: prisma.bundle.deleteMany({ where: { id: { in: ids } } })
// Drizzle:
await db.delete(bundle).where(inArray(bundle.id, ids))

// Prisma: prisma.bundle.updateMany({ data, where })
// Drizzle:
await db.update(bundle).set(data).where(and(...conditions))

// Prisma: prisma.bundle.count({ where })
// Drizzle:
const [row] = await db.select({ count: sql<number>`count(*)` }).from(bundle).where(...)
```

#### Relations / includes

Prisma's `include: { Team: true }` can be replaced with a join:

```typescript
// Prisma: prisma.project.findFirst({ where: { id }, include: { Team: true } })
// Drizzle:
const results = await db.select()
  .from(project)
  .innerJoin(team, eq(project.teamId, team.id))
  .where(eq(project.id, id))
  .limit(1)
// results[0] is { Project: {...}, Team: {...} }
```

Note: Drizzle returns join results keyed by the table name as declared in the schema (e.g., `mysqlTable('Project', ...)` produces `{ Project: row }`). If consumers expect a nested shape like `{ ...project, Team: team }`, map it:

```typescript
function toProjectWithTeam(row: { Project: typeof project.$inferSelect, Team: typeof team.$inferSelect }) {
  return { ...row.Project, Team: row.Team }
}
```

#### Relation filters (`some`, `none`, `every`)

Prisma's `{ where: { Tokens: { some: {} } } }` becomes an `exists` subquery:

```typescript
// Prisma: prisma.project.findMany({ where: { ProjectToken: { some: {} } } })
// Drizzle:
db.select().from(project).where(
  exists(
    db.select({ id: projectToken.id }).from(projectToken)
      .where(eq(projectToken.projectId, project.id))
  )
)

// Prisma: prisma.team.findFirst({ where: { Project: { some: { lokaliseProjectId: 'x' } } } })
// Drizzle:
db.select().from(team).where(
  exists(
    db.select({ id: project.id }).from(project)
      .where(and(
        eq(project.teamId, team.id),
        eq(project.lokaliseProjectId, 'x')
      ))
  )
).limit(1)
```

#### Aggregations / groupBy

```typescript
// Prisma: prisma.dailyStat.groupBy({ by: ['date', 'framework'], _sum: { downloads: true, trafficBytes: true }, where: {...} })
// Drizzle:
db.select({
  date: dailyStatistic.date,
  framework: dailyStatistic.framework,
  _sum: {
    downloads: sum(dailyStatistic.downloads).mapWith(Number),
    trafficBytes: sum(dailyStatistic.trafficBytes).mapWith(BigInt),
  },
})
.from(dailyStatistic)
.where(and(...conditions))
.groupBy(dailyStatistic.date, dailyStatistic.framework)
```

#### Raw SQL

```typescript
// Prisma: prisma.$queryRaw`SELECT ... WHERE id IN (${Prisma.join(ids)})`
// Drizzle — db.execute() returns [rows, fields], not just rows:
const [rows] = await db.execute(sql`SELECT ... WHERE id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`)

// Prisma: prisma.$executeRaw`INSERT ... ON DUPLICATE KEY UPDATE ...`
// Drizzle (MySQL — native support):
db.insert(table).values(rows).onDuplicateKeyUpdate({
  set: { downloads: sql`VALUES(downloads)` }
})
```

#### Transactions

```typescript
// Prisma interactive transaction:
// prisma.$transaction(async (tx) => { ... }, { timeout: 30000, isolationLevel: 'ReadCommitted' })
// Drizzle:
db.transaction(async (tx) => { ... }, { isolationLevel: 'read committed' })
// Note: Drizzle has no built-in timeout option. Use Promise.race or pool-level timeout.

// Prisma batched transaction:
// prisma.$transaction([prisma.a.delete(...), prisma.b.delete(...)])
// Drizzle (no batched transaction — use interactive):
db.transaction(async (tx) => {
  await tx.delete(a).where(...)
  await tx.delete(b).where(...)
})

// Prisma.TransactionClient type → DbTransaction (defined in client.ts above)
```

### Gotchas and pitfalls

#### Refining the introspected schema

`drizzle-kit introspect` produces a working schema, but it needs cleanup:

- **Remove `.charSet()` / `.collate()` noise**: Introspection adds these to every varchar/text column. Remove them unless your database uses non-default character sets.
- **Fix `bigint` mode**: Introspection defaults to `mode: 'number'`. If you use `BigInt` values (as Prisma does for `@db.UnsignedBigInt`), change to `mode: 'bigint'`.
- **Add `$onUpdate()`**: For columns that had Prisma `@updatedAt`, add `.$onUpdate(() => new Date())`.
- **Skip the `_prisma_migrations` table**: Introspection includes it — remove it from your schema.

#### Empty arrays in `inArray()`

Drizzle's `inArray(column, [])` produces invalid SQL (`IN ()`). Always guard:

```typescript
async deleteByIds(ids: number[]) {
  if (ids.length === 0) return
  await db.delete(bundle).where(inArray(bundle.id, ids))
}
```

#### MySQL: no `.returning()` on insert/update/delete

MySQL does not support `RETURNING`. Use `.$returningId()` (returns only the auto-increment id) and then select the full row. PostgreSQL supports `.returning()` natively.

#### Prisma enums → Drizzle

Prisma generates TypeScript enums. Drizzle uses `mysqlEnum()` / `pgEnum()` for the column, but does not generate a TS enum. Define a const object instead:

```typescript
// In schema.ts:
status: mysqlEnum(['uploading', 'uploaded']).default('uploading').notNull(),

// Separately, for use in application code:
export const BundleStatus = {
  uploading: 'uploading',
  uploaded: 'uploaded',
} as const
```

#### mysql2 DATE columns and timezone

Prisma handles all date serialization in UTC internally. When you switch to Drizzle with mysql2, date serialization is delegated to the mysql2 driver, which by default uses the **local timezone**. This silently breaks `DATE` column comparisons.

The problem: `new Date('2023-01-20')` is UTC midnight (`2023-01-20T00:00:00.000Z`). In a UTC+3 environment, mysql2 serializes it as `'2023-01-20 03:00:00'`. MySQL then promotes the stored `DATE '2023-01-20'` to `'2023-01-20 00:00:00'` for comparison, and `'2023-01-20 00:00:00' >= '2023-01-20 03:00:00'` evaluates to **false**. Inserts appear to work (MySQL truncates to the date part), but subsequent queries silently return fewer rows.

The fix: pass `timezone: 'Z'` when creating the mysql2 pool. This makes mysql2 serialize dates in UTC, matching Prisma's behavior:

```typescript
const pool = mysql.createPool({ uri: databaseUrl, timezone: 'Z' })
```

This affects any column using Drizzle's `date()` type. Without this setting, tests may pass on UTC machines but fail in any other timezone.

#### Drizzle's `date()` column returns a string, not a Date

Drizzle's `date()` type returns a `string` (`'2024-01-15'`) by default, while Prisma returns `Date` objects. If your application logic or tests compare dates with `instanceof Date` or call `.getTime()`, you will need to adjust. Use `date({ mode: 'date' })` in your schema to get `Date` objects instead.

#### `db.execute()` returns `[rows, fields]`, not rows

For mysql2, `db.execute(sql`...`)` returns the raw mysql2 result: a `[rows, fields]` tuple. If you cast the result directly to a row array, you get the tuple (length 2) instead of the actual rows. Destructure first:

```typescript
// Wrong — result is [rows, fields], not rows:
const result = await db.execute(sql`SELECT ...`)
return result as { id: number }[]  // always has length 2!

// Correct:
const [rows] = await db.execute(sql`SELECT ...`)
return rows as { id: number }[]
```

The return type is typed as `[ResultSetHeader, FieldPacket[]]` regardless of query type, so a cast is unavoidable for SELECT results. A typed helper can centralize this:

```typescript
import type { SQLWrapper } from 'drizzle-orm'

export async function executeRawQuery<T>(db: DbClient, query: SQLWrapper): Promise<T[]> {
  const [rows] = await db.execute(query)
  return rows as T[]
}

// Usage:
const tokens = await executeRawQuery<{ token: string }>(db, sql`SELECT ...`)
```

This does not apply to `prisma.$queryRaw`, which returns rows directly.

#### Test infrastructure: DI container `dispose()` closes all singleton pools

When using awilix (or similar DI containers) with a `dispose` function on the DB singleton, calling `diContainer.dispose()` closes the database connection pool. This is a common pattern when re-registering mocks in tests:

```typescript
// This closes the DB pool along with everything else!
const registerMock = async (app) => {
  await app.diContainer.dispose()
  app.diContainer.register('fileStorageClient', asClass(MockedClient, SINGLETON_CONFIG))
}
```

Any variable that captured a reference to `db` or a repository before the dispose now points to a closed pool. Subsequent queries fail with "Pool is closed".

Mitigations:
- **Refresh cached references** after dispose: `db = diContainer.cradle.db`
- **Assign `db` after mock registration**, not before, in `beforeAll`/`beforeEach`
- **Use `diContainer.cradle.db` in `afterEach` cleanup** instead of a cached `db` variable, since the cached reference may be stale

This was not an issue with Prisma because `PrismaClient` manages its own connection lifecycle and is not typically registered with a container-level dispose hook.

#### DI container rename: `prisma` → `db`

If using dependency injection (e.g., awilix), rename the key from `prisma` to `db`. TypeScript will flag every consumer that destructures `{ prisma }`, making it easy to find all references at compile time.

#### No code generation step

There is no Drizzle equivalent of `prisma generate` — the schema is plain TypeScript. Remove all `npx prisma generate` / `db:update-client` steps from CI, Dockerfile, and scripts.

### Infrastructure changes

#### Deployment scripts

Add both commands to your deploy script. The `mark-migrations-applied` call is idempotent and safe to run on every deployment:

```bash
npx mark-migrations-applied ./drizzle.config.ts && npx drizzle-kit migrate
```

For Docker, ensure `drizzle-kit` and `@lokalise/drizzle-utils` are production dependencies (not devDependencies) if migrations run inside the app container. Alternatively, run migrations in a separate init container or CI step.

#### Dockerfile

```dockerfile
# Remove:
# COPY prisma prisma
# RUN npx prisma generate

# Add to release stage:
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
```

#### CI workflows

Remove all `npx prisma generate` / `npm run db:update-client` steps. The migration step becomes:

```yaml
- name: Run migrations
  run: npm run db:migration:run
  # where db:migration:run = "npx mark-migrations-applied ./drizzle.config.ts && npx drizzle-kit migrate"
```

#### Other files to update

- **`.gitignore`**: Remove `prisma/ota` or other generated client paths
- **`dependabot.yml`**: Replace the `prisma` dependency group with `drizzle-orm`, `drizzle-kit`, `@lokalise/drizzle-utils`
- **`biome.json` / linter config**: Replace `!**/prisma/ota` exclusion with `!**/drizzle` (to exclude generated migration SQL)
- **`package.json` scripts**: Remove `prisma format` from `lint:fix`, remove `db:update-client`
