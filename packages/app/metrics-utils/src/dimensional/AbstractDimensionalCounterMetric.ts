import type promClient from 'prom-client'
import type { Counter } from 'prom-client'
import type { DimensionalMetricParams } from '../AbstractMetric.ts'
import { AbstractDimensionalMetric } from './AbstractDimensionalMetric.ts'

type DimensionalCounterMetricConfiguration<TDimensions extends string[]> =
  DimensionalMetricParams<TDimensions>

type DimensionalCounterMeasurement<TDimensions extends string[]> = Partial<
  Record<TDimensions[number], number>
>

export abstract class AbstractDimensionalCounterMetric<
  TDimensions extends string[],
> extends AbstractDimensionalMetric<
  Counter,
  TDimensions,
  DimensionalCounterMetricConfiguration<TDimensions>,
  DimensionalCounterMeasurement<TDimensions>
> {
  protected constructor(
    metricConfig: DimensionalCounterMetricConfiguration<TDimensions>,
    client?: typeof promClient,
  ) {
    super(metricConfig, client)
  }

  protected override createMetric(name: string, client: typeof promClient): Counter {
    const counter = new client.Counter({
      name,
      help: this.metricConfig.helpDescription,
      labelNames: [],
    })
    // Initializing the metric with 0 so it is exposed in scrapes even with no measurements.
    counter.inc(0)
    return counter
  }

  public override registerMeasurement(
    measurement: DimensionalCounterMeasurement<TDimensions>,
  ): void {
    if (this.metrics.size === 0) return

    for (const [dimension, value] of Object.entries(measurement)) {
      if (value === undefined) continue
      this.metrics.get(dimension)?.inc(value as number)
    }
  }
}
