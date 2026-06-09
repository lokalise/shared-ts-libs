import type promClient from 'prom-client'
import type { Counter } from 'prom-client'
import { AbstractLabeledMetric, type LabeledMetricParams } from './AbstractLabeledMetric.ts'

export type CounterMetricConfiguration<
  TMetricLabel extends string,
  TMetricMeasurementKeys extends readonly string[],
> = LabeledMetricParams & {
  label: TMetricLabel
  measurementKeys: TMetricMeasurementKeys
}

type CounterMeasurement<TMetricMeasurementKeys extends readonly string[]> = Partial<
  Record<TMetricMeasurementKeys[number], number>
>

/**
 * Base class for counter metrics with **exactly one label whose possible values are known at construction time**.
 *
 * Every value declared in `measurementKeys` is pre-initialized to `0` at registration, so the corresponding
 * time series exist from the start.
 *
 * Use {@link AbstractMultiLabeledCounterMetric} instead when you need more than one label, or when label values
 * are only known at runtime.
 */
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

  /**
   * Increments the counter for one or more of the declared `measurementKeys`.
   *
   * Pass an object mapping each measurement key to the amount to add. Keys with `undefined` values are skipped.
   */
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
