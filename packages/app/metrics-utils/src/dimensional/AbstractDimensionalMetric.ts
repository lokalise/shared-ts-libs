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

  protected constructor(metricConfig: MetricsParams, client?: typeof promClient) {
    super(metricConfig)
    this.metrics = new Map()
    if (!client) return

    for (const dimension of metricConfig.dimensions) {
      const name = this.buildMetricName(dimension)
      const metric = getOrCreateMetric(client, name, () => this.createMetric(name, client))
      this.metrics.set(dimension, metric)
    }
  }

  private buildMetricName(dimension: string): string {
    const { namePrefix, nameSuffix } = this.metricConfig
    const base = `${namePrefix}_${dimension}`
    return nameSuffix ? `${base}:${nameSuffix}` : base
  }
}
