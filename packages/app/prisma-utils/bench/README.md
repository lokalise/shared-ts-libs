# prismaBulkUpdate benchmark

Measures `prismaBulkUpdate` against a table shaped like a tenant-scoped segment table: the primary key starts with `project_id`, and `id` has its own unique index. The benchmark updates 2, 100 and 1000 rows of one large tenant with `where: { project_id, id }`.

Start the database and seed it once. The seed drops and recreates `bench_segment`, so it wipes any earlier benchmark data:

```bash
docker compose up -d --wait
pnpm bench:seed
pnpm bench
```

The default dataset is 1 000 000 rows in the large tenant plus 1 000 tenants of 1 000 rows each. Change it with `BENCH_LARGE_TENANT_ROWS`, `BENCH_SMALL_TENANTS` and `BENCH_SMALL_TENANT_ROWS`. Both scripts read `DATABASE_URL` from `.env`, and a value set in the environment takes precedence.

To compare two versions of the code, save one run and compare the other against it:

```bash
pnpm bench --outputJson before.json
pnpm bench --compare before.json
```

The plan depends on the CockroachDB version. v23.2 picks the `id` index whether `project_id` is joined from `VALUES` or bound as a constant. v26.1 reads the whole tenant through the primary key prefix when `project_id` comes from `VALUES`.
