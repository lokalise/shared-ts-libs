# @lokalise/prisma-utils

## 7.0.1

### Patch Changes

- 2aa65c7: `prismaBulkUpdate` emits a `where` column whose value is the same string, number, boolean or bigint on every entry as a constant predicate (`"tbl"."col" = $n::type`) instead of a `VALUES` column. On CockroachDB this stops a tenant column such as `project_id` from steering the planner into a lookup join that reads every row of the tenant. Results are unchanged; the generated statement and its bind-parameter count differ for every caller that passes such a column.

## 7.0.0

### Major Changes

- 790e1a9: Replace the `prom-client` peer dependency with `@prometheus-io/client`, the same library after its
  donation to the Prometheus project.
  
  Consumers must install `@prometheus-io/client` and pass that client, instead of `prom-client`, to
  `prismaClientFactory`, `extendPrismaClientWithMetrics`, the metric base classes and the Prometheus
  transaction managers. `healthcheck-utils` registers its gauges on `@prometheus-io/client`'s default
  registry. The two packages keep separate registries, so metrics registered through one are not
  exposed by the other's `register.metrics()`: a process scraping `prom-client` will not see them.

## 6.1.0

### Minor Changes

- 65ff0e9: Add `prismaBulkUpdate`: update many rows in a single atomic SQL statement (one `UPDATE ... FROM (VALUES ...)`), with per-column SQL type casts, optional `RETURNING`, and support for both CockroachDB and PostgreSQL via the `dbDriver` option.
