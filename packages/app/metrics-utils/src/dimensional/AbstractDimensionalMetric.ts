import type promClient from 'prom-client'
import type { Metric } from 'prom-client'
import { AbstractMetric, type CommonMetricParams } from '../AbstractMetric.ts'
import { getOrCreateMetric } from '../getOrCreateMetric.ts'

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

    // Eager mode: pre-register every declared dimension.
    if (!metricConfig.lazyInit) {
      for (const dimension of metricConfig.dimensions) this.createAndCache(client, dimension)
    }
  }

  protected getOrRegisterMetric(dimension: TDimensions[number]): MetricType | undefined {
    if (!this.client) return

    const existing = this.metrics.get(dimension)
    if (existing) return existing

    if (!this.metricConfig.lazyInit) {
      throw new Error(`Dimension "${dimension}" was not declared in "dimensions"`)
    }

    if (this.metricConfig.dimensions && !this.metricConfig.dimensions.includes(dimension)) {
      throw new Error(
        `Dimension "${dimension}" is not in the declared allow-list (${this.metricConfig.dimensions.join(', ')}).`,
      )
    }

    return this.createAndCache(this.client, dimension)
  }

  private createAndCache(client: typeof promClient, dimension: TDimensions[number]): MetricType {
    const name = this.metricConfig.buildMetricName(dimension)
    const metric = getOrCreateMetric(client, name, () => this.createMetric(name, client))
    this.metrics.set(dimension, metric)

    return metric
  }
}
