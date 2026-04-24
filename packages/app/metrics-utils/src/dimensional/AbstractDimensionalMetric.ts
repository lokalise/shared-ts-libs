import type promClient from 'prom-client'
import type { Metric } from 'prom-client'
import { AbstractMetric, type DimensionalMetricParams } from '../AbstractMetric.ts'
import { getOrCreateMetric } from '../getOrCreateMetric.ts'

export abstract class AbstractDimensionalMetric<
  MetricType extends Metric,
  TDimensions extends readonly string[],
  MetricsParams extends DimensionalMetricParams<TDimensions>,
  TMeasurement,
> extends AbstractMetric<MetricType, MetricsParams, TMeasurement> {
  protected readonly metrics: Map<TDimensions[number], MetricType>
  protected readonly client?: typeof promClient

  protected constructor(metricConfig: MetricsParams, client?: typeof promClient) {
    super(metricConfig)
    this.metrics = new Map()
    this.client = client
    if (!client) return

    if (!metricConfig.lazyInit) {
      for (const dimension of metricConfig.dimensions) this.getOrRegisterMetric(dimension)
    }
  }

  /**
   * Returns the metric for the given dimension, creating and caching it on first access. Returns
   * `undefined` when no Prometheus client is attached. Used both by the eager pre-registration loop
   * in the constructor and by subclasses' `registerMeasurement` when `lazyInit` is enabled.
   */
  protected getOrRegisterMetric(dimension: TDimensions[number]): MetricType | undefined {
    const client = this.client
    if (!client) return

    const existing = this.metrics.get(dimension)
    if (existing) return existing

    const name = this.metricConfig.buildMetricName(dimension)
    const metric = getOrCreateMetric(client, name, () => this.createMetric(name, client))
    this.metrics.set(dimension, metric)

    return metric
  }
}
