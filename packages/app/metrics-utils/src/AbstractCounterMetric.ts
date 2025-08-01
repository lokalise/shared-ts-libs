import type promClient from 'prom-client'
import type { Counter } from 'prom-client'
import { AbstractMetric, type BaseMetricParams } from './AbstractMetric.ts'

type CounterMetricConfiguration<
  TMetricLabel extends string,
  TMetricMeasurementKeys extends string[],
> = BaseMetricParams & {
  label: TMetricLabel
  measurementKeys: TMetricMeasurementKeys
}

type CounterMeasurement<TMetricMeasurementKeys extends string[]> = Partial<
  Record<TMetricMeasurementKeys[number], number>
>

export abstract class AbstractCounterMetric<
  TMetricLabel extends string,
  TMetricMeasurementKeys extends string[],
> extends AbstractMetric<
  Counter<TMetricLabel>,
  CounterMetricConfiguration<TMetricLabel, TMetricMeasurementKeys>
> {
  protected constructor(
    metricConfig: CounterMetricConfiguration<TMetricLabel, TMetricMeasurementKeys>,
    client?: typeof promClient,
  ) {
    super(metricConfig, client)
  }

  protected override createMetric(client: typeof promClient): Counter<TMetricLabel> {
    const counter = new client.Counter({
      name: this.metricConfig.name,
      help: this.metricConfig.helpDescription,
      labelNames: [this.metricConfig.label],
    })

    // Initializing the metric with default values, so that they are present even if no data was registered yet.
    for (const measurementKey of this.metricConfig.measurementKeys) {
      counter
        .labels({
          [this.metricConfig.label]: measurementKey,
        } as Record<TMetricLabel, string>)
        .inc(0)
    }

    return counter
  }

  public override registerMeasurement(
    measurement: CounterMeasurement<TMetricMeasurementKeys>,
  ): void {
    if (!this.metric) return

    for (const [measurementKey, value] of Object.entries(measurement) as [
      TMetricMeasurementKeys[number],
      number,
    ][]) {
      this.metric
        .labels({
          [this.metricConfig.label]: measurementKey,
        } as Record<TMetricLabel, string>)
        .inc(value)
    }
  }
}
