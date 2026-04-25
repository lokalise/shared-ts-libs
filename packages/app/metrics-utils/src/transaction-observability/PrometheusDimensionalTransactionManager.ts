import type promClient from 'prom-client'
import { AbstractPrometheusTransactionManager } from './AbstractPrometheusTransactionManager.ts'
import {
  type ManagerDimensionalBuildMetricName,
  ManagerDimensionalCounter,
  type ManagerDimensionalCounterBaseConfig,
  ManagerDimensionalHistogram,
  type ManagerDimensionalHistogramBaseConfig,
  type TransactionStatus,
} from './utils.ts'

export type PrometheusDimensionalTransactionManagerConfig = {
  buildMetricName: ManagerDimensionalBuildMetricName
} & (
  | (ManagerDimensionalCounterBaseConfig & { type: 'counter' })
  | (ManagerDimensionalHistogramBaseConfig & { type: 'histogram' })
)

export class PrometheusDimensionalTransactionManager extends AbstractPrometheusTransactionManager {
  private readonly counter?: ManagerDimensionalCounter
  private readonly histogram?: ManagerDimensionalHistogram

  constructor(config: PrometheusDimensionalTransactionManagerConfig, client?: typeof promClient) {
    super()
    if (config.type === 'counter') {
      this.counter = new ManagerDimensionalCounter(
        {
          helpDescription: config.helpDescription,
          buildMetricName: config.buildMetricName,
        },
        client,
      )
    } else if (config.type === 'histogram') {
      this.histogram = new ManagerDimensionalHistogram(
        {
          helpDescription: config.helpDescription,
          buildMetricName: config.buildMetricName,
          buckets: config.buckets,
        },
        client,
      )
    }
  }

  protected override emitMeasurement(
    _uniqueTransactionKey: string,
    transactionName: string,
    status: TransactionStatus,
    durationMs: number,
  ): void {
    this.counter?.incForTransaction(transactionName, status, 1)
    this.histogram?.observeForTransaction(transactionName, status, durationMs)
  }

  override addCustomAttributes(
    _uniqueTransactionKey: string,
    _attributes: Record<string, string | number | boolean>,
  ): void {
    // intentionally empty
  }
}
