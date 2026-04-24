import type promClient from 'prom-client'
import type { Metric } from 'prom-client'

export type CommonMetricParams = {
  helpDescription: string
}

export type LabeledMetricParams = CommonMetricParams & {
  name: string
}

export type DimensionalMetricParams<TDimensions extends readonly string[]> = CommonMetricParams & {
  buildMetricName: (dimension: TDimensions[number]) => string
} & (
    | {
        /**
         * Eager mode (default). All `dimensions` are pre-registered at construction time. At runtime,
         * a measurement for a dimension that was not declared throws an error — unknown dimensions
         * are treated as bugs, not silently dropped.
         */
        lazyInit?: false
        dimensions: TDimensions
      }
    | {
        /**
         * Lazy mode. No pre-registration happens at construction time.
         *
         * - If `dimensions` is provided, it acts as an allow-list: only those dimensions are
         *   registered (lazily, on first measurement); a measurement for a dimension outside the
         *   allow-list throws an error.
         * - If `dimensions` is omitted, any dimension is accepted and registered lazily.
         */
        lazyInit: true
        dimensions?: TDimensions
      }
  )

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
