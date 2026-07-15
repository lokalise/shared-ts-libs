import type promClient from 'prom-client'
import type { Metric } from 'prom-client'
import { AbstractMetric, type CommonMetricParams } from '../AbstractMetric.ts'
import { getOrCreateMetric } from '../getOrCreateMetric.ts'

export type LabeledMetricParams = CommonMetricParams & {
  name: string
}

export abstract class AbstractLabeledMetric<
  MetricType extends Metric,
  MetricsParams extends LabeledMetricParams,
  TMeasurement,
> extends AbstractMetric<MetricType, MetricsParams, TMeasurement> {
  protected readonly metric?: MetricType

  protected constructor(metricConfig: MetricsParams, client?: typeof promClient) {
    super(metricConfig)
    if (!client) return

    this.metric = getOrCreateMetric(client, metricConfig.name, () =>
      this.createMetric(metricConfig.name, client),
    )
  }
}
