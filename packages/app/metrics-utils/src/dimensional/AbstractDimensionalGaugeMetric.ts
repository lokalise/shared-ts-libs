import type promClient from 'prom-client'
import type { Gauge } from 'prom-client'
import {
  AbstractDimensionalMetric,
  type DimensionalMetricParams,
} from './AbstractDimensionalMetric.ts'

type DimensionalGaugeMeasurement<TDimensions extends readonly string[]> = Partial<
  Record<TDimensions[number], number>
>

/**
 * Base class for gauge metrics where each dimension is registered as a **separate label-free Prometheus Gauge**.
 *
 * A gauge represents a value that can go up or down (e.g. queue depth, in-flight requests); each measurement
 * **sets** the current value for its dimension rather than adding to it. The metric name for each dimension is
 * produced by the caller-provided `buildMetricName(dimension)` callback. Intended for backends that do not
 * support Prometheus labels (e.g. some Datadog setups); when labels are supported, prefer
 * {@link AbstractLabeledGaugeMetric} or {@link AbstractMultiLabeledGaugeMetric}.
 *
 * In eager mode (default) every declared dimension is pre-registered with a value of `0`; with `lazyInit: true`,
 * each metric is registered on the first measurement targeting its dimension.
 */
export abstract class AbstractDimensionalGaugeMetric<
  TDimensions extends readonly string[],
> extends AbstractDimensionalMetric<
  Gauge,
  TDimensions,
  DimensionalMetricParams<TDimensions>,
  DimensionalGaugeMeasurement<TDimensions>
> {
  protected constructor(
    metricConfig: DimensionalMetricParams<TDimensions>,
    client?: typeof promClient,
  ) {
    super(metricConfig, client)
  }

  protected override createMetric(name: string, client: typeof promClient): Gauge {
    const gauge = new client.Gauge({
      name,
      help: this.metricConfig.helpDescription,
      labelNames: [],
    })
    // Eager mode: pre-init to 0 so the series is exposed in scrapes before any measurement.
    // Lazy mode: the metric is created on the first measurement, pre-init is not needed.
    if (!this.metricConfig.lazyInit) gauge.set(0)

    return gauge
  }

  /**
   * Sets the per-dimension gauge for one or more dimensions.
   *
   * Pass an object mapping each dimension to the value to set. Keys with `undefined` values are skipped.
   * A measurement targeting a dimension outside the declared set is silently ignored.
   */
  public override registerMeasurement(measurement: DimensionalGaugeMeasurement<TDimensions>): void {
    if (!this.client) return

    for (const [dimension, value] of Object.entries(measurement)) {
      if (value === undefined) continue

      this.getOrRegisterMetric(dimension)?.set(value as number)
    }
  }
}
