import type promClient from 'prom-client'
import {
  AbstractLabeledHistogramMetric,
  type HistogramMetricConfiguration,
} from '../labeled/AbstractLabeledHistogramMetric.ts'
import {
  AbstractMultiLabeledCounterMetric,
  type MultiLabeledCounterMetricConfiguration,
} from '../labeled/AbstractMultiLabeledCounterMetric.ts'

export type TransactionStatus = 'success' | 'error'
export const prometheusTransactionManagerBuiltInLabels = ['status', 'transaction_name'] as const
export type PrometheusTransactionManagerLabels<CustomLabels extends readonly string[]> = readonly (
  | (typeof prometheusTransactionManagerBuiltInLabels)[number]
  | CustomLabels[number]
)[]

export class ManagerLabeledCounter<
  CustomLabels extends readonly string[],
> extends AbstractMultiLabeledCounterMetric<PrometheusTransactionManagerLabels<CustomLabels>> {
  // biome-ignore lint/complexity/noUselessConstructor: promotes the abstract's protected ctor to public
  constructor(
    config: MultiLabeledCounterMetricConfiguration<
      PrometheusTransactionManagerLabels<CustomLabels>
    >,
    client?: typeof promClient,
  ) {
    super(config, client)
  }
}

export class ManagerLabeledHistogram<
  CustomLabels extends readonly string[],
> extends AbstractLabeledHistogramMetric<PrometheusTransactionManagerLabels<CustomLabels>> {
  // biome-ignore lint/complexity/noUselessConstructor: promotes the abstract's protected ctor to public
  constructor(
    config: HistogramMetricConfiguration<PrometheusTransactionManagerLabels<CustomLabels>>,
    client?: typeof promClient,
  ) {
    super(config, client)
  }
}
