# Developing @lokalise/drizzle-utils

This document is for people working on the library itself. Usage docs for consumers live in [README.md](README.md). Run every command below from `packages/app/drizzle-utils`.

## Local databases

`docker-compose.yml` starts PostgreSQL on port `5432`, CockroachDB (`cockroachdb/cockroach:latest-v26.2`, insecure, user `root`, database `defaultdb`) on port `26257` and MySQL on port `3306`. `.env.test` points `DATABASE_URL`, `COCKROACHDB_DATABASE_URL` and `MYSQL_DATABASE_URL` at them. Variables already set in the environment take precedence over `.env.test`, which is how to run against other instances.

```bash
docker compose up -d --wait
pnpm test
```

`pnpm test:ci` does the same inside a fresh `docker compose` stack and tears it down afterwards. CI runs it.

## Benchmarking `drizzleFullBulkUpdate`

The benchmark is run by hand and never in CI. It runs on CockroachDB or Postgres, whichever `BENCH_DATABASE` picks. It needs a seeded 2M-row table and takes minutes, and its timings depend on the machine. `pnpm test` only collects `src/**/*.test.ts`, and nothing in CI calls `vitest bench`, so the files under `bench/` are typechecked and linted but not executed there.

### What it measures

`bench/seed.ts` creates `bench_segment`, shaped like a tenant-scoped segment table: the primary key is `(project_id, n)`, and `id` is unique through its own index. `bench/drizzleFullBulkUpdate.bench.ts` updates 2, 100 and 1000 rows of the large tenant with `where: { project_id, id }`, spread across the whole tenant. This is the case the constant `where` rule targets. When `project_id` is joined from `VALUES`, CockroachDB can choose a lookup join on the primary key prefix and read every row of the tenant.

Both scripts connect through `COCKROACHDB_DATABASE_URL` by default. With `BENCH_DATABASE=postgres` they use `DATABASE_URL` instead, which points at the compose file's `postgres:18.4-alpine`, the Postgres version `lokalise/autopilot` runs.

### Running it

Seed once, then benchmark as often as needed. The containers keep no volume, so `docker compose down` drops `bench_segment`; seed again after it:

```bash
docker compose up -d --wait cockroachdb
pnpm bench:seed
pnpm bench
```

On Postgres:

```bash
docker compose up -d --wait postgres
export BENCH_DATABASE=postgres
pnpm bench:seed
pnpm bench
```

Each database keeps its own `bench_segment`, so seed each one you benchmark.

`pnpm bench:seed` drops and recreates `bench_segment`, so it wipes any earlier benchmark data. The default dataset is one tenant of 1 000 000 rows and 1 000 tenants of 1 000 rows, and seeding it takes a few minutes. It finishes with `CREATE STATISTICS` on CockroachDB, or `ANALYZE` on Postgres, so the planner sees the real distribution. These variables change the size:

| Variable | Default | Meaning |
|---|---|---|
| `BENCH_LARGE_TENANT_ROWS` | `1000000` | Rows in the tenant the benchmark updates |
| `BENCH_SMALL_TENANTS` | `1000` | Number of other tenants |
| `BENCH_SMALL_TENANT_ROWS` | `1000` | Rows in each other tenant |

Both scripts use `vitest.bench.config.ts`, which reuses `vitest.config.ts` with its own `include`. `vitest run` with it runs only the seed, and `vitest bench` with it runs only `bench/**/*.bench.ts`.

### Comparing two versions

Save a run of the baseline, then compare the change against it. For example, to measure the working tree against `main`:

```bash
cp src/drizzleFullBulkUpdate.ts drizzleFullBulkUpdate.ts.wip
git show main:packages/app/drizzle-utils/src/drizzleFullBulkUpdate.ts > src/drizzleFullBulkUpdate.ts
pnpm bench --outputJson before.json; mv drizzleFullBulkUpdate.ts.wip src/drizzleFullBulkUpdate.ts
pnpm bench --compare before.json
```

The copy keeps uncommitted edits to the file, and the `;` puts it back even when the baseline run fails.

The compare run prints each result next to its baseline with the speed ratio. Benchmark before and after on the same database and the same seed. On Postgres, run `VACUUM ANALYZE bench_segment` before each run, so the dead rows the previous run left behind do not favour whichever version goes first. Other containers busy on the same machine show up as noise in the timings.

### Checking the plan

Timings vary with machine load. The plan and the rows read do not, so check them when a change is meant to alter the plan. Run the statement under `EXPLAIN ANALYZE` in a SQL shell, with the values inlined, because CockroachDB does not accept placeholders in `EXPLAIN`:

```bash
docker compose exec cockroachdb cockroach sql --insecure
```

In the output, compare `rows decoded from KV` and the `table:` and `equality:` lines of each lookup join. A statement that reads the whole tenant shows the tenant's row count there and a lookup on `(project_id)` alone.

The plan depends on the database. CockroachDB v26.2 reads the whole tenant when `project_id` comes from `VALUES`. Postgres 18 uses the `id` index for both shapes, so there the change only removes bound parameters. Its `EXPLAIN` does not take placeholders either:

```bash
docker compose exec postgres psql -U testuser -d test
```

Benchmark on the version production runs.
