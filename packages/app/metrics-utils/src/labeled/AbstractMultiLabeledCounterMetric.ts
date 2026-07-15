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

/**
 * Base class for counter metrics with **one or more labels whose values are not necessarily known at construction time**.
 *
 * Unlike {@link AbstractLabeledCounterMetric}, no time series are pre-initialized: each series appears the first
 * time `registerMeasurement` is called with that label combination.
 *
 * Use {@link AbstractLabeledCounterMetric} instead when you have exactly one label with a fully enumerable set
 * of values and want every series to exist from the start.
 */
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

  /**
   * Increments the counter for the given label combination by `increment`.
   *
   * The measurement object carries one value per declared label plus a mandatory `increment` indicating how
   * much to add to the counter for that combination.
   */
  public override registerMeasurement(measurement: MultiLabeledCounterMeasurement<Labels>): void {
    if (!this.metric) return

    const { increment, ...labels } = measurement
    this.metric.inc(labels as object, increment)
  }
}
