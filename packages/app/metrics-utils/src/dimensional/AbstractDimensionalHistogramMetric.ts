import type promClient from 'prom-client'
import type { Histogram } from 'prom-client'
import {
  AbstractDimensionalMetric,
  type DimensionalMetricParams,
} from './AbstractDimensionalMetric.ts'

export type DimensionalHistogramMetricConfiguration<TDimensions extends readonly string[]> =
  DimensionalMetricParams<TDimensions> & {
    buckets: number[]
  }

type DimensionalHistogramMeasurement<TDimensions extends readonly string[]> =
  | { dimension: TDimensions[number]; time: number; startTime?: never; endTime?: never }
  | { dimension: TDimensions[number]; time?: never; startTime: number; endTime: number }

/**
 * Base class for histogram metrics where each dimension is registered as a **separate label-free Prometheus Histogram**.
 *
 * The metric name for each dimension is produced by the caller-provided `buildMetricName(dimension)` callback.
 * Intended for backends that do not support Prometheus labels (e.g. some Datadog setups); when labels are
 * supported, prefer {@link AbstractLabeledHistogramMetric}.
 *
 * In eager mode (default) every declared dimension is pre-registered at construction; with `lazyInit: true`,
 * each metric is registered on the first measurement targeting its dimension.
 */
export abstract class AbstractDimensionalHistogramMetric<
  TDimensions extends readonly string[],
> extends AbstractDimensionalMetric<
  Histogram,
  TDimensions,
  DimensionalHistogramMetricConfiguration<TDimensions>,
  DimensionalHistogramMeasurement<TDimensions>
> {
  protected constructor(
    metricConfig: DimensionalHistogramMetricConfiguration<TDimensions>,
    client?: typeof promClient,
  ) {
    super(metricConfig, client)
  }

  protected override createMetric(name: string, client: typeof promClient): Histogram {
    return new client.Histogram({
      name,
      help: this.metricConfig.helpDescription,
      buckets: this.metricConfig.buckets,
      labelNames: [],
    })
  }

  /**
   * Records an observation on the histogram for the given `dimension`.
   *
   * Provide the duration as either `time` directly, or as a `startTime`/`endTime` pair from which the duration
   * is computed. A measurement targeting a dimension outside the declared set throws (unless running in lazy
   * open mode).
   */
  public override registerMeasurement(
    measurement: DimensionalHistogramMeasurement<TDimensions>,
  ): void {
    const histogram = this.getOrRegisterMetric(measurement.dimension)
    if (!histogram) return

    const { time, startTime, endTime } = measurement
    const duration = time ?? endTime - startTime
    histogram.observe({}, duration)
  }
}
