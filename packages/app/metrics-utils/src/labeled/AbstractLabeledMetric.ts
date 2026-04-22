import type promClient from 'prom-client'
import type { Metric } from 'prom-client'
import { AbstractMetric, type BaseMetricParams } from '../AbstractMetric.ts'
import { getOrRegisterMetric } from '../getOrRegisterMetric.ts'

export abstract class AbstractLabeledMetric<
  MetricType extends Metric,
  MetricsParams extends BaseMetricParams,
  TMeasurement,
> extends AbstractMetric<MetricType, MetricsParams, TMeasurement> {
  protected readonly metric?: MetricType

  protected constructor(metricConfig: MetricsParams, client?: typeof promClient) {
    super(metricConfig)
    if (!client) return

    this.metric = getOrRegisterMetric(client, metricConfig.name, () =>
      this.createMetric(metricConfig.name, client),
    )
  }
}
