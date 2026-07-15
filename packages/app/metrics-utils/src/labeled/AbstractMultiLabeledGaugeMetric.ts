import type promClient from 'prom-client'
import type { Gauge } from 'prom-client'
import { AbstractLabeledMetric, type LabeledMetricParams } from './AbstractLabeledMetric.ts'

export type MultiLabeledGaugeMetricConfiguration<Labels extends readonly string[]> =
  LabeledMetricParams & {
    labelNames: Labels
  }

type MultiLabeledGaugeMeasurement<Labels extends readonly string[]> = Partial<
  Record<Labels[number], string | number>
> & {
  value: number
}

/**
 * Base class for gauge metrics with **one or more labels whose values are not necessarily known at construction time**.
 *
 * A gauge represents a value that can go up or down (e.g. queue depth, in-flight requests); each measurement
 * **sets** the current value for the given label combination rather than adding to it. Unlike
 * {@link AbstractLabeledGaugeMetric}, no time series are pre-initialized: each series appears the first time
 * `registerMeasurement` is called with that label combination.
 *
 * Use {@link AbstractLabeledGaugeMetric} instead when you have exactly one label with a fully enumerable set
 * of values and want every series to exist from the start.
 */
export abstract class AbstractMultiLabeledGaugeMetric<
  Labels extends readonly string[],
> extends AbstractLabeledMetric<
  Gauge<Labels[number]>,
  MultiLabeledGaugeMetricConfiguration<Labels>,
  MultiLabeledGaugeMeasurement<Labels>
> {
  protected constructor(
    metricConfig: MultiLabeledGaugeMetricConfiguration<Labels>,
    client?: typeof promClient,
  ) {
    super(metricConfig, client)
  }

  protected override createMetric(name: string, client: typeof promClient): Gauge<Labels[number]> {
    return new client.Gauge({
      name,
      help: this.metricConfig.helpDescription,
      labelNames: this.metricConfig.labelNames,
    })
  }

  /**
   * Sets the gauge to `value` for the given label combination.
   *
   * The measurement object carries one value per declared label plus a mandatory `value` indicating the
   * current value to set the gauge to for that combination.
   */
  public override registerMeasurement(measurement: MultiLabeledGaugeMeasurement<Labels>): void {
    if (!this.metric) return

    const { value, ...labels } = measurement
    this.metric.set(labels as object, value)
  }
}
