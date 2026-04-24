import type promClient from 'prom-client'
import type { Counter } from 'prom-client'
import {
  AbstractDimensionalMetric,
  type DimensionalMetricParams,
} from './AbstractDimensionalMetric.ts'

type DimensionalCounterMeasurement<TDimensions extends readonly string[]> = Partial<
  Record<TDimensions[number], number>
>

export abstract class AbstractDimensionalCounterMetric<
  TDimensions extends readonly string[],
> extends AbstractDimensionalMetric<
  Counter,
  TDimensions,
  DimensionalMetricParams<TDimensions>,
  DimensionalCounterMeasurement<TDimensions>
> {
  protected constructor(
    metricConfig: DimensionalMetricParams<TDimensions>,
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
    if (!this.client) return

    for (const [dimension, value] of Object.entries(measurement)) {
      if (value === undefined) continue

      this.getOrRegisterMetric(dimension)?.inc(value as number)
    }
  }
}
