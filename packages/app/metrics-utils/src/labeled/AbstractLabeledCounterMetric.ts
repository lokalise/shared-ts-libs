import type promClient from 'prom-client'
import type { Counter } from 'prom-client'
import type { LabeledMetricParams } from '../AbstractMetric.ts'
import { AbstractLabeledMetric } from './AbstractLabeledMetric.ts'

type CounterMetricConfiguration<
  TMetricLabel extends string,
  TMetricMeasurementKeys extends readonly string[],
> = LabeledMetricParams & {
  label: TMetricLabel
  measurementKeys: TMetricMeasurementKeys
}

type CounterMeasurement<TMetricMeasurementKeys extends readonly string[]> = Partial<
  Record<TMetricMeasurementKeys[number], number>
>

export abstract class AbstractLabeledCounterMetric<
  TMetricLabel extends string,
  TMetricMeasurementKeys extends readonly string[],
> extends AbstractLabeledMetric<
  Counter<TMetricLabel>,
  CounterMetricConfiguration<TMetricLabel, TMetricMeasurementKeys>,
  CounterMeasurement<TMetricMeasurementKeys>
> {
  protected constructor(
    metricConfig: CounterMetricConfiguration<TMetricLabel, TMetricMeasurementKeys>,
    client?: typeof promClient,
  ) {
    super(metricConfig, client)
  }

  protected override createMetric(name: string, client: typeof promClient): Counter<TMetricLabel> {
    const counter = new client.Counter({
      name,
      help: this.metricConfig.helpDescription,
      labelNames: [this.metricConfig.label],
    })

    // Initializing the metric with default values, so that they are present even if no data was registered yet.
    for (const measurementKey of this.metricConfig.measurementKeys) {
      counter
        .labels({ [this.metricConfig.label]: measurementKey } as Record<TMetricLabel, string>)
        .inc(0)
    }

    return counter
  }

  public override registerMeasurement(
    measurement: CounterMeasurement<TMetricMeasurementKeys>,
  ): void {
    if (!this.metric) return

    for (const [measurementKey, value] of Object.entries(measurement)) {
      if (value === undefined) continue
      this.metric
        .labels({ [this.metricConfig.label]: measurementKey } as Record<TMetricLabel, string>)
        .inc(value as number)
    }
  }
}
