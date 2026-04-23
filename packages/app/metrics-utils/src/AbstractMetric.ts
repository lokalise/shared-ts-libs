import type promClient from 'prom-client'
import type { Metric } from 'prom-client'

export type CommonMetricParams = {
  helpDescription: string
}

export type LabeledMetricParams = CommonMetricParams & {
  name: string
}

export type DimensionalMetricParams<TDimensions extends readonly string[]> = CommonMetricParams & {
  namePrefix: string
  nameSuffix?: string
  dimensions: TDimensions
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
