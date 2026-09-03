import type promClient from '@prometheus-io/client'
import type { Metric } from '@prometheus-io/client'

export type CommonMetricParams = {
  helpDescription: string
}

export abstract class AbstractMetric<
  MetricType extends Metric,
  MetricsParams extends CommonMetricParams,
  TMeasurement,
> {
  protected readonly metricConfig: MetricsParams

  protected constructor(metricConfig: MetricsParams) {
    this.metricConfig = metricConfig
  }

  protected abstract createMetric(name: string, client: typeof promClient): MetricType

  public abstract registerMeasurement(measurement: TMeasurement): void
}
