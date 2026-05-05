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

/**
 * `TransactionObservabilityManager` implementation that emits transactions as **one label-free Prometheus
 * metric per `(transactionName, status)` combo**, with the metric name produced by the caller-provided
 * `buildMetricName(transactionName, status)` callback.
 *
 * Use this for backends that do not support Prometheus labels (e.g. some Datadog setups). When labels are
 * supported, prefer {@link PrometheusLabeledTransactionManager}.
 */
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

  /**
   * No-op by design. Surfacing attributes as additional `(transactionName, status, ...attrs)` combos would
   * spawn one metric per combination and risk an unbounded number of registered metrics.
   */
  override addCustomAttributes(
    _uniqueTransactionKey: string,
    _attributes: Record<string, string | number | boolean>,
  ): void {}
}
