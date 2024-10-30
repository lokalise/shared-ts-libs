import type { PrismaClient } from '@prisma/client'
import type { Metrics } from '@prisma/client/runtime/library'
import type { FastifyBaseLogger } from 'fastify'
import * as prometheus from 'prom-client'

export type PrometheusMetricsDefinitions = {
  counters: Record<string, prometheus.Counter<'prisma' | 'connection-pool'>>
  gauges: Record<string, prometheus.Gauge<'prisma' | 'connection-pool'>>
  histograms: Record<string, prometheus.Histogram<'prisma' | 'connection-pool'>>
  names: string[]
}

type PrometheusMetrics = {
  counters: Record<string, prometheus.MetricObject>
  gauges: Record<string, prometheus.MetricObject>
  histograms: Record<string, prometheus.MetricObject>
}

export type MetricCollectorOptions = {
  metricsPrefix: string
}

function registerMetrics(_prefix: string, jsonMetrics: Metrics): PrometheusMetricsDefinitions {
  const metrics: PrometheusMetricsDefinitions = {
    counters: {},
    gauges: {},
    histograms: {},
    names: [],
  }
  for (const metric of jsonMetrics.counters) {
    metrics.counters[metric.key] = new prometheus.Counter({
      name: metric.key,
      help: metric.description,
      labelNames: ['prisma', 'connection_pool'] as const,
    })
    metrics.names.push(metric.key)
  }

  for (const metric of jsonMetrics.gauges) {
    metrics.gauges[metric.key] = new prometheus.Gauge({
      name: metric.key,
      help: metric.description,
      labelNames: ['prisma', 'connection_pool'] as const,
    })
    metrics.names.push(metric.key)
  }

  for (const metric of jsonMetrics.histograms) {
    metrics.histograms[metric.key] = new prometheus.Histogram({
      name: metric.key,
      help: metric.description,
      buckets: metric.value.buckets.filter((bucket) => bucket[1] === 0).map((bucket) => bucket[0]),
      labelNames: ['prisma', 'connection_pool'] as const,
    })
    metrics.names.push(metric.key)
  }

  return metrics
}

function getMetricKeys(_prefix: string, jsonMetrics: Metrics): string[] {
  const metricKeys: string[] = []
  metricKeys.push(...jsonMetrics.counters.map((metric) => metric.key))
  metricKeys.push(...jsonMetrics.gauges.map((metric) => metric.key))
  metricKeys.push(...jsonMetrics.histograms.map((metric) => metric.key))
  return metricKeys
}

export class MetricsCollector {
  private metrics?: PrometheusMetricsDefinitions

  constructor(
    private readonly prisma: PrismaClient,
    private readonly options: MetricCollectorOptions,
    private readonly registry: prometheus.Registry,
    private readonly logger: FastifyBaseLogger,
  ) {
    this.registerMetrics(this.registry, this.options).then((result) => {
      this.metrics = result
    })
  }

  /**
   * Updates metrics for prisma
   */
  async collect(): Promise<void> {
    if (!this.metrics) {
      return
    }

    try {
      const jsonMetrics = await this.getJsonMetrics()
      for (const counterMetric of jsonMetrics.counters) {
        // we need to reset counter since prisma returns already the accumulated counter value
        this.metrics.counters[counterMetric.key].reset()
        this.metrics.counters[counterMetric.key].inc(counterMetric.value)
      }
      for (const gaugeMetric of jsonMetrics.gauges) {
        this.metrics.gauges[gaugeMetric.key].set(gaugeMetric.value)
      }
      for (const histogramMetric of jsonMetrics.histograms) {
        this.metrics.histograms[histogramMetric.key].observe(histogramMetric.value.count)
      }
    } catch (err) {
      /* c8 ignore start */
      this.logger.error(err)
    }
    /* c8 ignore stop */
  }

  /**
   * Stops the metrics collection and cleans up resources
   */
  async dispose() {}

  private async registerMetrics(
    registry: prometheus.Registry,
    { metricsPrefix }: MetricCollectorOptions,
  ): Promise<PrometheusMetricsDefinitions> {
    const jsonMetrics = await this.getJsonMetrics()
    const metricNames: string[] = getMetricKeys(metricsPrefix, jsonMetrics)

    // If metrics are already registered, just return them to avoid triggering a Prometheus error
    const existingMetrics = this.getRegisteredMetrics(registry, metricNames)
    if (existingMetrics) {
      /* c8 ignore start */
      return existingMetrics
    }
    /* c8 ignore stop */

    return registerMetrics(metricsPrefix, jsonMetrics)
  }

  private getRegisteredMetrics(
    registry: prometheus.Registry,
    metricNames: string[],
  ): PrometheusMetricsDefinitions | undefined {
    // If metrics are already registered, just return them to avoid triggering a Prometheus error
    if (!metricNames.length || !registry.getSingleMetric(metricNames[0])) {
      return
    }

    /* c8 ignore start */
    const retrievedMetrics = registry.getMetricsAsArray()
    const returnValue: PrometheusMetrics = {
      counters: {},
      histograms: {},
      gauges: {},
    }

    for (const metric of retrievedMetrics) {
      if (!metricNames.includes(metric.name)) {
        continue
      }

      if (metric.type.toString() === 'counter') {
        returnValue.counters[metric.name as keyof Metrics] = metric
      }
      if (metric.type.toString() === 'gauge') {
        returnValue.gauges[metric.name as keyof Metrics] = metric
      }
      if (metric.type.toString() === 'histogram') {
        returnValue.histograms[metric.name as keyof Metrics] = metric
      }
    }

    return returnValue as unknown as PrometheusMetricsDefinitions
    /* c8 ignore stop */
  }

  private getJsonMetrics() {
    return this.prisma.$metrics.json()
  }
}
