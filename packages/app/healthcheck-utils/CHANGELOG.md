# @lokalise/healthcheck-utils

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

- b52200e: Support BullMQ 6 and ioredis 6 alongside 5. `background-jobs-common` widens its peer ranges to
  `^5.28.2 || ^6.0.0` (bullmq) and `^5.4.1 || ^6.0.0` (ioredis); `healthcheck-utils` widens its ioredis peer
  to `^5.4.1 || ^6.0.0`.
  
  BullMQ 6 removes `paused` from `JobType`, drops `debounce` and `repeat` from `JobsOptions`, and renames the
  `FlowChildJob` type to `FlowJobNode`. The library now derives the flow child type from `FlowJob` and deletes the
  removed job options through a record, so one source tree compiles against both majors. `getJobCount` still counts
  the `paused` state; on BullMQ 6 that key is never written and contributes 0.

## 6.0.1

### Patch Changes

- 26064c1: Deps update
