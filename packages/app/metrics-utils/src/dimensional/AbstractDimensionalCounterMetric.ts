import type promClient from 'prom-client'
import type { Counter } from 'prom-client'
import {
  AbstractDimensionalMetric,
  type DimensionalMetricParams,
} from './AbstractDimensionalMetric.ts'

type DimensionalCounterMeasurement<
  TDimensions extends readonly string[],
  TLabels extends readonly string[],
> = Partial<Record<TDimensions[number], number>> & {
  labels?: Partial<Record<TLabels[number], string | number>>
}

/**
 * Base class for counter metrics where each dimension is registered as a **separate label-free Prometheus Counter**.
 *
 * The metric name for each dimension is produced by the caller-provided `buildMetricName(dimension)` callback.
 * Intended for backends that do not support Prometheus labels (e.g. some Datadog setups); when labels are
 * supported, prefer {@link AbstractLabeledCounterMetric} or {@link AbstractMultiLabeledCounterMetric}.
 *
 * In eager mode (default) every declared dimension is pre-registered with a value of `0`; with `lazyInit: true`,
 * each metric is registered on the first measurement targeting its dimension.
 */
export abstract class AbstractDimensionalCounterMetric<
  TDimensions extends readonly string[],
  TLabels extends readonly string[] = [],
> extends AbstractDimensionalMetric<
  Counter<TLabels[number]>,
  TDimensions,
  DimensionalMetricParams<TDimensions, TLabels>,
  DimensionalCounterMeasurement<TDimensions, TLabels>
> {
  protected constructor(
    metricConfig: DimensionalMetricParams<TDimensions, TLabels>,
    client?: typeof promClient,
  ) {
    super(metricConfig, client)
  }

  protected override createMetric(
    name: string,
    client: typeof promClient,
  ): Counter<TLabels[number]> {
    const counter = new client.Counter({
      name,
      help: this.metricConfig.helpDescription,
      labelNames: this.metricConfig.labelNames ?? [],
    })
    // Eager mode: pre-init to 0 so the series is exposed in scrapes before any measurement.
    // Lazy mode: the metric is created on the first measurement, pre-init is not needed.
    if (!this.metricConfig.lazyInit) counter.inc(0)

    return counter
  }

  /**
   * Increments the per-dimension counter for one or more dimensions.
   *
   * Pass an object mapping each dimension to the amount to add. Keys with `undefined` values are skipped.
   * Optional Prometheus label values can be supplied via `labels`, applied to every dimension in the call.
   * A measurement targeting a dimension outside the declared set is silently ignored.
   */
  public override registerMeasurement(
    measurement: DimensionalCounterMeasurement<TDimensions, TLabels>,
  ): void {
    if (!this.client) return

    const { labels, ...dimensions } = measurement
    const hasLabels = labels && Object.keys(labels).length > 0
    const entries = Object.entries(dimensions) as [string, number | undefined][]
    for (const [dimension, value] of entries) {
      if (value === undefined) continue

      const counter = this.getOrRegisterMetric(dimension)
      if (!counter) continue

      if (hasLabels) counter.inc(labels as object, value)
      else counter.inc(value)
    }
  }
}
