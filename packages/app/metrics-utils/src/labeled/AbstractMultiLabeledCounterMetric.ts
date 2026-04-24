import type promClient from 'prom-client'
import type { Counter } from 'prom-client'
import { AbstractLabeledMetric, type LabeledMetricParams } from './AbstractLabeledMetric.ts'

export type MultiLabeledCounterMetricConfiguration<Labels extends readonly string[]> =
  LabeledMetricParams & {
    labelNames: Labels
  }

type MultiLabeledCounterMeasurement<Labels extends readonly string[]> = Partial<
  Record<Labels[number], string | number>
> & {
  increment: number
}

export abstract class AbstractMultiLabeledCounterMetric<
  Labels extends readonly string[],
> extends AbstractLabeledMetric<
  Counter<Labels[number]>,
  MultiLabeledCounterMetricConfiguration<Labels>,
  MultiLabeledCounterMeasurement<Labels>
> {
  protected constructor(
    metricConfig: MultiLabeledCounterMetricConfiguration<Labels>,
    client?: typeof promClient,
  ) {
    super(metricConfig, client)
  }

  protected override createMetric(
    name: string,
    client: typeof promClient,
  ): Counter<Labels[number]> {
    return new client.Counter({
      name,
      help: this.metricConfig.helpDescription,
      labelNames: this.metricConfig.labelNames,
    })
  }

  public override registerMeasurement(measurement: MultiLabeledCounterMeasurement<Labels>): void {
    if (!this.metric) return

    const { increment, ...labels } = measurement
    this.metric.inc(labels as object, increment)
  }
}
