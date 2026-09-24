# Developing @lokalise/prisma-utils

This document is for people working on the library itself. Usage docs for consumers live in [README.md](README.md). Run every command below from `packages/app/prisma-utils`.

## Local database

The tests and the benchmark need CockroachDB. `docker-compose.yml` starts a single node of `cockroachdb/cockroach:latest-v26.1` on port `26257` (admin UI on `8181`), with user `testuser`, password `pass` and database `test`. `.env` points `DATABASE_URL` at it:

```bash
docker compose up -d --wait
```

The container runs `docker/init.sql` on first start. It sets `create_table_with_schema_locked = false` for every role. Recent CockroachDB versions, v26.1 included, create tables schema-locked, and a locked table rejects the `CREATE INDEX` that follows its `CREATE TABLE` in the same Prisma migration, so without it the init migration fails with `this schema change is disallowed because table "item1" is locked`. The script only runs when the node initializes a new cluster. If you have a node that was started without it, recreate it with `docker compose down` followed by `docker compose up -d --wait`.

`DATABASE_URL` from the environment takes precedence over `.env` for the tests, the seed and the benchmark, which is how to run them against another instance.

The compose file also defines `postgres` (`postgres:18.4`, the version `lokalise/autopilot` runs) on `127.0.0.1:54318`, with the same user, password and database. It sits behind the `postgres` profile, so `docker compose up` and `pnpm test:ci` leave it out. Only the benchmark uses it:

```bash
docker compose --profile postgres up -d --wait postgres
export DATABASE_URL='postgresql://testuser:pass@127.0.0.1:54318/test'
```

## Tests

```bash
pnpm test:migrate   # resets the test database and applies prisma/migrations
pnpm test
```

`pnpm test:ci` does the same inside a fresh `docker compose` stack and tears it down afterwards. CI runs it.

## Benchmarking `prismaBulkUpdate`

The benchmark is run by hand and never in CI. It runs on CockroachDB or Postgres, whichever `DATABASE_URL` points at, and reads the driver from `SELECT version()`. It needs a seeded 2M-row table and takes minutes, and its timings depend on the machine. `pnpm test` collects only `*.spec.ts` and `*.test.ts` files, and nothing in CI calls `vitest bench`, so the files under `bench/` are typechecked and linted but not executed there.

### What it measures

`bench/seed.ts` creates `bench_segment`, shaped like a tenant-scoped segment table: the primary key is `(project_id, n)`, and `id` is unique through its own index. `bench/prismaBulkUpdate.bench.ts` updates 2, 100 and 1000 rows of the large tenant with `where: { project_id, id }`, spread across the whole tenant. This is the case the constant `where` rule targets. When `project_id` is joined from `VALUES`, CockroachDB can choose a lookup join on the primary key prefix and read every row of the tenant.

### Running it

Seed once, then benchmark as often as needed. `pnpm test:migrate` and `docker compose down` both drop `bench_segment`, so seed again after either:

```bash
docker compose up -d --wait
pnpm bench:seed
pnpm bench
```

`pnpm bench:seed` drops and recreates `bench_segment`, so it wipes any earlier benchmark data. The default dataset is one tenant of 1 000 000 rows and 1 000 tenants of 1 000 rows, and seeding it takes a few minutes. It finishes with `CREATE STATISTICS` on CockroachDB, or `ANALYZE` on Postgres, so the planner sees the real distribution. These variables change the size:

| Variable | Default | Meaning |
|---|---|---|
| `BENCH_LARGE_TENANT_ROWS` | `1000000` | Rows in the tenant the benchmark updates |
| `BENCH_SMALL_TENANTS` | `1000` | Number of other tenants |
| `BENCH_SMALL_TENANT_ROWS` | `1000` | Rows in each other tenant |

Both scripts use `vitest.bench.config.ts`, which extends `vitest.config.ts`. `vitest run` with it runs only the seed, and `vitest bench` with it runs only `bench/**/*.bench.ts`.

### Comparing two versions

Save a run of the baseline, then compare the change against it. For example, to measure the working tree against `main`:

```bash
cp src/bulk-update/prismaBulkUpdate.ts prismaBulkUpdate.ts.wip
git show main:packages/app/prisma-utils/src/bulk-update/prismaBulkUpdate.ts > src/bulk-update/prismaBulkUpdate.ts
pnpm bench --outputJson before.json; mv prismaBulkUpdate.ts.wip src/bulk-update/prismaBulkUpdate.ts
pnpm bench --compare before.json
```

The copy keeps uncommitted edits to the file, and the `;` puts it back even when the baseline run fails.

The compare run prints each result next to its baseline with the speed ratio. Benchmark before and after on the same database and the same seed. On Postgres, run `VACUUM ANALYZE bench_segment` before each run, so the dead rows the previous run left behind do not favour whichever version goes first. Other containers busy on the same machine show up as noise in the timings.

### Checking the plan

Timings vary with machine load. The plan and the rows read do not, so check them when a change is meant to alter the plan. Run the statement under `EXPLAIN ANALYZE` in a SQL shell, with the values inlined, because CockroachDB does not accept placeholders in `EXPLAIN`:

```bash
docker compose exec cockroachdb cockroach sql --certs-dir=certs -d test
```

In the output, compare `rows decoded from KV` and the `table:` and `equality:` lines of each lookup join. A statement that reads the whole tenant shows the tenant's row count there and a lookup on `(project_id)` alone.

The plan depends on the CockroachDB version. v23.2 uses the `id` index whether `project_id` comes from `VALUES` or is a constant, so it cannot show the difference. v26.1 reads the whole tenant when `project_id` comes from `VALUES`. Postgres 18 uses the `id` index for both shapes, so there the change only removes bound parameters. Its `EXPLAIN` does not take placeholders either:

```bash
docker compose exec postgres psql -U testuser -d test
```

Benchmark on the version production runs.
