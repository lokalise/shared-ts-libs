import type promClient from 'prom-client'
import type { Counter } from 'prom-client'

type DimensionalCounterMetricConfiguration<TDimensions extends string[]> = {
  namePrefix: string
  nameSuffix: string
  helpDescription: string
  dimensions: TDimensions
}

type DimensionalCounterMeasurement<TDimensions extends string[]> = Partial<
  Record<TDimensions[number], number>
>

function buildDimensionalMetricName(
  namePrefix: string,
  dimension: string,
  nameSuffix: string,
): string {
  return `${namePrefix}_${dimension}:${nameSuffix}`
}

export abstract class AbstractDimensionalCounterMetric<TDimensions extends string[]> {
  private readonly counters: Map<TDimensions[number], Counter>

  protected constructor(
    metricConfig: DimensionalCounterMetricConfiguration<TDimensions>,
    client?: typeof promClient,
  ) {
    this.counters = new Map()
    if (!client) return

    for (const dimension of metricConfig.dimensions) {
      const name = buildDimensionalMetricName(
        metricConfig.namePrefix,
        dimension,
        metricConfig.nameSuffix,
      )
      const existing = client.register.getSingleMetric(name)
      const counter = existing
        ? (existing as Counter)
        : new client.Counter({ name, help: metricConfig.helpDescription, labelNames: [] })
      counter.inc(0)
      this.counters.set(dimension, counter)
    }
  }

  public registerMeasurement(measurement: DimensionalCounterMeasurement<TDimensions>): void {
    if (this.counters.size === 0) return

    for (const [dimension, value] of Object.entries(measurement) as [
      TDimensions[number],
      number,
    ][]) {
      this.counters.get(dimension)?.inc(value)
    }
  }
}
