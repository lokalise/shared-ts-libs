import type promClient from 'prom-client'
import type { Histogram } from 'prom-client'
import type { BaseDimensionalMetricParams } from './AbstractMetric.ts'

type DimensionalHistogramMetricConfiguration<TDimensions extends string[]> =
  BaseDimensionalMetricParams & {
    dimensions: TDimensions
    buckets: number[]
  }

type DimensionalHistogramMeasurement =
  | { time: number; startTime?: never; endTime?: never }
  | { time?: never; startTime: number; endTime: number }

function buildDimensionalMetricName(
  namePrefix: string,
  dimension: string,
  nameSuffix: string,
): string {
  return `${namePrefix}_${dimension}:${nameSuffix}`
}

export abstract class AbstractDimensionalHistogramMetric<TDimensions extends string[]> {
  private readonly histograms: Map<TDimensions[number], Histogram>

  protected constructor(
    metricConfig: DimensionalHistogramMetricConfiguration<TDimensions>,
    client?: typeof promClient,
  ) {
    this.histograms = new Map()
    if (!client) return

    for (const dimension of metricConfig.dimensions) {
      const name = buildDimensionalMetricName(
        metricConfig.namePrefix,
        dimension,
        metricConfig.nameSuffix,
      )
      const existing = client.register.getSingleMetric(name)
      const histogram = existing
        ? (existing as Histogram)
        : new client.Histogram({
            name,
            help: metricConfig.helpDescription,
            buckets: metricConfig.buckets,
            labelNames: [],
          })
      this.histograms.set(dimension, histogram)
    }
  }

  public registerMeasurement(
    dimension: TDimensions[number],
    measurement: DimensionalHistogramMeasurement,
  ): void {
    if (this.histograms.size === 0) return

    const histogram = this.histograms.get(dimension)
    if (!histogram) return

    const { time, startTime, endTime } = measurement
    const duration = time ?? endTime - startTime
    histogram.observe({}, duration)
  }
}
