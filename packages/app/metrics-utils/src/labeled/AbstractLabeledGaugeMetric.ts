import type promClient from 'prom-client'
import type { Gauge } from 'prom-client'
import { AbstractLabeledMetric, type LabeledMetricParams } from './AbstractLabeledMetric.ts'

export type GaugeMetricConfiguration<
  TMetricLabel extends string,
  TMetricMeasurementKeys extends readonly string[],
> = LabeledMetricParams & {
  label: TMetricLabel
  measurementKeys: TMetricMeasurementKeys
}

type GaugeMeasurement<TMetricMeasurementKeys extends readonly string[]> = Partial<
  Record<TMetricMeasurementKeys[number], number>
>

/**
 * Base class for gauge metrics with **exactly one label whose possible values are known at construction time**.
 *
 * A gauge represents a value that can go up or down (e.g. queue depth, in-flight requests); each measurement
 * **sets** the current value rather than adding to it. Every value declared in `measurementKeys` is
 * pre-initialized to `0` at registration, so the corresponding time series exist from the start.
 *
 * Use {@link AbstractMultiLabeledGaugeMetric} instead when you need more than one label, or when label values
 * are only known at runtime.
 */
export abstract class AbstractLabeledGaugeMetric<
  TMetricLabel extends string,
  TMetricMeasurementKeys extends readonly string[],
> extends AbstractLabeledMetric<
  Gauge<TMetricLabel>,
  GaugeMetricConfiguration<TMetricLabel, TMetricMeasurementKeys>,
  GaugeMeasurement<TMetricMeasurementKeys>
> {
  protected constructor(
    metricConfig: GaugeMetricConfiguration<TMetricLabel, TMetricMeasurementKeys>,
    client?: typeof promClient,
  ) {
    super(metricConfig, client)
  }

  protected override createMetric(name: string, client: typeof promClient): Gauge<TMetricLabel> {
    const gauge = new client.Gauge({
      name,
      help: this.metricConfig.helpDescription,
      labelNames: [this.metricConfig.label],
    })

    // Initializing the metric with default values, so that they are present even if no data was registered yet.
    for (const measurementKey of this.metricConfig.measurementKeys) {
      gauge
        .labels({ [this.metricConfig.label]: measurementKey } as Record<TMetricLabel, string>)
        .set(0)
    }

    return gauge
  }

  /**
   * Sets the gauge value for one or more of the declared `measurementKeys`.
   *
   * Pass an object mapping each measurement key to the value to set. Keys with `undefined` values are skipped.
   */
  public override registerMeasurement(
    measurement: GaugeMeasurement<TMetricMeasurementKeys>,
  ): void {
    if (!this.metric) return

    for (const [measurementKey, value] of Object.entries(measurement)) {
      if (value === undefined) continue
      this.metric
        .labels({ [this.metricConfig.label]: measurementKey } as Record<TMetricLabel, string>)
        .set(value as number)
    }
  }
}
