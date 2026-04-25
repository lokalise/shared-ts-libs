import type promClient from 'prom-client'
import { AbstractDimensionalCounterMetric } from '../dimensional/AbstractDimensionalCounterMetric.ts'
import {
  AbstractDimensionalHistogramMetric,
  type DimensionalHistogramMetricConfiguration,
} from '../dimensional/AbstractDimensionalHistogramMetric.ts'
import type { DimensionalMetricParams } from '../dimensional/AbstractDimensionalMetric.ts'
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

type PrometheusTransactionManagerLabels<CustomLabels extends readonly string[]> = readonly (
  | (typeof prometheusTransactionManagerBuiltInLabels)[number]
  | CustomLabels[number]
)[]

export type ManagerLabeledCounterBaseConfig<CustomLabels extends readonly string[]> = Omit<
  MultiLabeledCounterMetricConfiguration<PrometheusTransactionManagerLabels<CustomLabels>>,
  'labelNames'
>

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

export type ManagerLabeledHistogramBaseConfig<CustomLabels extends readonly string[]> = Omit<
  HistogramMetricConfiguration<PrometheusTransactionManagerLabels<CustomLabels>>,
  'labelNames'
>

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

export type ManagerDimensionalBuildMetricName = (
  transactionName: string,
  status: TransactionStatus,
) => string

export type ManagerDimensionalCounterBaseConfig = Omit<
  DimensionalMetricParams<readonly string[]>,
  'dimensions' | 'buildMetricName' | 'lazyInit'
> & {
  buildMetricName: ManagerDimensionalBuildMetricName
}

export class ManagerDimensionalCounter extends AbstractDimensionalCounterMetric<readonly string[]> {
  private readonly buildMetricName: ManagerDimensionalBuildMetricName

  constructor(config: ManagerDimensionalCounterBaseConfig, client?: typeof promClient) {
    super(
      {
        dimensions: [],
        lazyInit: true,
        helpDescription: config.helpDescription,
        // `dim` is already the full metric name; see `incForTransaction` below.
        buildMetricName: (dim) => dim,
      },
      client,
    )
    this.buildMetricName = config.buildMetricName
  }

  public incForTransaction(
    transactionName: string,
    status: TransactionStatus,
    increment: number,
  ): void {
    const metricName = this.buildMetricName(transactionName, status)
    this.registerMeasurement({ [metricName]: increment })
  }
}

/**
 * Base configuration shared between the dimensional histogram helper and the manager's histogram
 * branch. Keeps `buckets` from the abstract's histogram config.
 */
export type ManagerDimensionalHistogramBaseConfig = Omit<
  DimensionalHistogramMetricConfiguration<readonly string[]>,
  'dimensions' | 'buildMetricName' | 'lazyInit'
> & {
  buildMetricName: ManagerDimensionalBuildMetricName
}
export class ManagerDimensionalHistogram extends AbstractDimensionalHistogramMetric<
  readonly string[]
> {
  private readonly buildMetricName: ManagerDimensionalBuildMetricName

  constructor(config: ManagerDimensionalHistogramBaseConfig, client?: typeof promClient) {
    super(
      {
        dimensions: [],
        lazyInit: true,
        helpDescription: config.helpDescription,
        buckets: config.buckets,
        // `dim` is already the full metric name; see `observeForTransaction` below.
        buildMetricName: (dim) => dim,
      },
      client,
    )
    this.buildMetricName = config.buildMetricName
  }

  public observeForTransaction(
    transactionName: string,
    status: TransactionStatus,
    durationMs: number,
  ): void {
    const metricName = this.buildMetricName(transactionName, status)
    this.registerMeasurement({ dimension: metricName, time: durationMs })
  }
}
