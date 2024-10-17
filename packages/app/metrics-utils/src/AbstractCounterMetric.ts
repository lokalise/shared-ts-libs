import type { RequestContext } from '@lokalise/fastify-extras'
import type { IFastifyMetrics } from 'fastify-metrics'
import type { Counter } from 'prom-client'

type CounterMetricConfiguration<
  TMetricLabel extends string,
  TMetricMeasurementKeys extends string[],
> = {
  name: string
  helpDescription: string
  label: TMetricLabel
  measurementKeys: TMetricMeasurementKeys
}

export abstract class AbstractCounterMetric<
  TMetricLabel extends string,
  TMetricMeasurementKeys extends string[],
> {
  /** Fallbacks to null if metrics are disabled on app level */
  private readonly counterMetric: Counter<TMetricLabel> | null

  private readonly metricConfiguration: CounterMetricConfiguration<
    TMetricLabel,
    TMetricMeasurementKeys
  >

  protected constructor(
    metricConfiguration: CounterMetricConfiguration<TMetricLabel, TMetricMeasurementKeys>,
    appMetrics?: IFastifyMetrics,
  ) {
    this.metricConfiguration = metricConfiguration
    this.counterMetric = this.registerMetric(appMetrics)
  }

  protected registerMetric(appMetrics?: IFastifyMetrics): Counter<TMetricLabel> | null {
    if (!appMetrics) {
      return null
    }

    const existingMetric = appMetrics.client.register.getSingleMetric(
      this.metricConfiguration.name,
    ) as Counter<TMetricLabel> | undefined

    if (existingMetric) {
      return existingMetric
    }

    const counter = new appMetrics.client.Counter({
      name: this.metricConfiguration.name,
      help: this.metricConfiguration.helpDescription,
      labelNames: [this.metricConfiguration.label],
    })

    // Initializing the metric with default values, so that they are present even if no data was registered yet.
    for (const measurementKey of this.metricConfiguration.measurementKeys) {
      counter
        .labels({
          [this.metricConfiguration.label]: measurementKey,
        } as Record<TMetricLabel, string>)
        .inc(0)
    }

    return counter
  }

  public registerMeasurement(
    measurementKeyToValue: Partial<Record<TMetricMeasurementKeys[number], number>>,
    reqContext?: RequestContext,
  ) {
    if (!this.counterMetric) {
      reqContext?.logger.warn('Metrics not enabled, skipping')
      return
    }

    reqContext?.logger.info({ measurementKeyToValue }, 'Registering new metric measurements')

    for (const [measurementKey, value] of Object.entries(measurementKeyToValue) as [
      TMetricMeasurementKeys[number],
      number,
    ][]) {
      this.counterMetric
        .labels({
          [this.metricConfiguration.label]: measurementKey,
        } as Record<TMetricLabel, string>)
        .inc(value)
    }
  }
}
