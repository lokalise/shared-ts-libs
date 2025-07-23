import type promClient from 'prom-client'
import type { Metric } from 'prom-client'

export type BaseMetricParams = {
  name: string
  helpDescription: string
}

export abstract class AbstractMetric<
  MetricType extends Metric,
  MetricsParams extends BaseMetricParams,
> {
  protected readonly metric?: MetricType
  protected readonly metricConfig: MetricsParams

  protected constructor(metricConfig: MetricsParams, client?: typeof promClient) {
    this.metricConfig = metricConfig

    if (!client) return
    this.metric = this.registerMetric(client)
  }

  private registerMetric(client: typeof promClient): MetricType {
    const existingMetric = client.register.getSingleMetric(this.metricConfig.name)

    return existingMetric ? (existingMetric as MetricType) : this.createMetric(client)
  }

  protected abstract createMetric(client: typeof promClient): MetricType

  public abstract registerMeasurement(measurement: unknown): void
}
