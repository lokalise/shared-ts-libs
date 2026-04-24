import type promClient from 'prom-client'
import type { Histogram } from 'prom-client'
import type { LabeledMetricParams } from '../AbstractMetric.ts'
import { AbstractLabeledMetric } from './AbstractLabeledMetric.ts'

export type HistogramMetricConfiguration<Labels extends readonly string[]> = LabeledMetricParams & {
  buckets: number[]
  labelNames: Labels
}

type HistogramMeasurement<Labels extends readonly string[]> = Partial<
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

export abstract class AbstractLabeledHistogramMetric<
  Labels extends readonly string[],
> extends AbstractLabeledMetric<
  Histogram<Labels[number]>,
  HistogramMetricConfiguration<Labels>,
  HistogramMeasurement<Labels>
> {
  protected constructor(
    metricConfig: HistogramMetricConfiguration<Labels>,
    client?: typeof promClient,
  ) {
    super(metricConfig, client)
  }

  protected override createMetric(
    name: string,
    client: typeof promClient,
  ): Histogram<Labels[number]> {
    return new client.Histogram({
      name,
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
