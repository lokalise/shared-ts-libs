# @lokalise/prisma-utils

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
