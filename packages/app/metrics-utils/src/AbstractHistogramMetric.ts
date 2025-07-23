import type promClient from 'prom-client'
import type { Histogram } from 'prom-client'
import { AbstractMetric, type BaseMetricParams } from './AbstractMetric.ts'

type HistogramMetricConfiguration<Labels extends string[]> = BaseMetricParams & {
  buckets: number[]
  labelNames: Labels
}

type HistogramMeasurement<Labels extends string[]> = Partial<
  Record<Labels[number], string | number>
> &
  (
    | {
        time: number
        startTime?: never
        endTime?: never
      }
    | {
        time?: never
        startTime: number
        endTime: number
      }
  )

export abstract class AbstractHistogramMetric<Labels extends string[]> extends AbstractMetric<
  Histogram<Labels[number]>,
  HistogramMetricConfiguration<Labels>
> {
  protected constructor(
    metricConfig: HistogramMetricConfiguration<Labels>,
    client?: typeof promClient,
  ) {
    super(metricConfig, client)
  }

  protected override createMetric(client: typeof promClient): Histogram<Labels[number]> {
    return new client.Histogram({
      name: this.metricConfig.name,
      help: this.metricConfig.helpDescription,
      buckets: this.metricConfig.buckets,
      labelNames: this.metricConfig.labelNames,
    })
  }

  public override registerMeasurement(measurement: HistogramMeasurement<Labels>): void {
    if (!this.metric) return

    const { time, startTime, endTime, ...labels } = measurement

    const duration = time ?? endTime - startTime

    this.metric.observe(labels as object, duration)
  }
}
