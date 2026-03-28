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
})
```

## Step 4: Generate the initial migration

```bash
npx drizzle-kit generate
```

This produces SQL migration files that describe your full schema (`CREATE TABLE`, etc.). These describe the *target state*, which your database already has — they must NOT be executed directly.

Review the generated SQL to verify it matches your existing database. If there are differences, fix your Drizzle schema and regenerate.

## Step 5: Mark migrations as applied (the baseline)

Since your `drizzle.config.ts` already has the connection details and migrations folder, just run the CLI:

```bash
npx @lokalise/drizzle-utils mark-migrations-applied ./drizzle.config.ts
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
- Drop the Prisma shadow database and `_prisma_migrations` table when you are confident the migration is complete

From this point on, all new schema changes go through the normal Drizzle workflow:

```bash
# Edit your Drizzle schema, then:
npx drizzle-kit generate   # generates a new migration
npx drizzle-kit migrate    # applies only the new migration
```

## Important notes

- **Run the baseline before `drizzle-kit migrate`**: If you run `migrate` first, Drizzle will attempt to execute `CREATE TABLE` statements and fail.
- **Schema drift**: If your Prisma schema and actual database have drifted apart, use `drizzle-kit introspect` rather than converting from Prisma — the database is the source of truth.
- **Parallel ORM usage**: During the transition you can run Prisma and Drizzle side-by-side. Just make sure all new migrations go through one ORM only (Drizzle) to avoid conflicts.
- **CI/CD**: Add the baseline script to your deployment pipeline so it runs before `drizzle-kit migrate`. Since it's idempotent, it's safe to run on every deploy.
