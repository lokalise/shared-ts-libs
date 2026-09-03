# @lokalise/metrics-utils

## 7.0.0

### Major Changes

- 790e1a9: Replace the `prom-client` peer dependency with `@prometheus-io/client`, the same library after its
  donation to the Prometheus project.
  
  Consumers must install `@prometheus-io/client` and pass that client, instead of `prom-client`, to
  `prismaClientFactory`, `extendPrismaClientWithMetrics`, the metric base classes and the Prometheus
  transaction managers. `healthcheck-utils` registers its gauges on `@prometheus-io/client`'s default
  registry. The two packages keep separate registries, so metrics registered through one are not
  exposed by the other's `register.metrics()`: a process scraping `prom-client` will not see them.

## 6.3.0

### Minor Changes

- e442986: Add optional `labelNames` support to dimensional counter, gauge, and histogram metrics. Declare `labelNames` in the config and pass values via a `labels` sub-object on the measurement; omitting labels preserves the existing label-free behaviour.

## 6.2.0

### Minor Changes

- f985722: Add gauge metric support: `AbstractLabeledGaugeMetric` (single known label, pre-initialized to 0), `AbstractMultiLabeledGaugeMetric` (one or more labels, including the two-label case, discovered at runtime), and `AbstractDimensionalGaugeMetric` (one label-free metric per dimension, with eager/lazy registration). Each measurement sets the current gauge value.

## 6.1.0

### Minor Changes

- 1293816: Adding Prometheus-based transaction observability managers so we can use them to record metrics across all packages that use transaction managers.
