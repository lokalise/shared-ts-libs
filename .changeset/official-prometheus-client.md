---
"@lokalise/healthcheck-utils": major
"@lokalise/metrics-utils": major
"@lokalise/prisma-utils": major
---

Replace the `prom-client` peer dependency with `@prometheus-io/client`, the same library after its
donation to the Prometheus project.

Consumers must install `@prometheus-io/client` and pass that client, instead of `prom-client`, to
`prismaClientFactory`, `extendPrismaClientWithMetrics`, the metric base classes and the Prometheus
transaction managers. `healthcheck-utils` registers its gauges on `@prometheus-io/client`'s default
registry. The two packages keep separate registries, so metrics registered through one are not
exposed by the other's `register.metrics()`: a process scraping `prom-client` will not see them.
