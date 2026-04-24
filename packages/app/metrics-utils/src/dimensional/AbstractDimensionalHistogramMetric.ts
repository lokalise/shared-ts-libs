import type promClient from 'prom-client'
import type { Histogram } from 'prom-client'
import type { DimensionalMetricParams } from '../AbstractMetric.ts'
import { AbstractDimensionalMetric } from './AbstractDimensionalMetric.ts'

type DimensionalHistogramMetricConfiguration<TDimensions extends readonly string[]> =
  DimensionalMetricParams<TDimensions> & {
    buckets: number[]
  }

type DimensionalHistogramMeasurement<TDimensions extends readonly string[]> =
  | { dimension: TDimensions[number]; time: number; startTime?: never; endTime?: never }
  | { dimension: TDimensions[number]; time?: never; startTime: number; endTime: number }

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

  public override registerMeasurement(
    measurement: DimensionalHistogramMeasurement<TDimensions>,
  ): void {
    if (this.metrics.size === 0) return

    const histogram = this.metrics.get(measurement.dimension)
    if (!histogram) return

    const { time, startTime, endTime } = measurement
    const duration = time ?? endTime - startTime
    histogram.observe({}, duration)
  }
}
