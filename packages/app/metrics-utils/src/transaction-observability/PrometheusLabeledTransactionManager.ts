import type promClient from 'prom-client'
import type { HistogramMetricConfiguration } from '../labeled/AbstractLabeledHistogramMetric.ts'
import type { MultiLabeledCounterMetricConfiguration } from '../labeled/AbstractMultiLabeledCounterMetric.ts'
import { AbstractPrometheusTransactionManager } from './AbstractPrometheusTransactionManager.ts'
import {
  ManagerLabeledCounter,
  ManagerLabeledHistogram,
  prometheusTransactionManagerBuiltInLabels,
  type PrometheusTransactionManagerLabels,
  type TransactionStatus,
} from './utils.ts'

export type PrometheusLabeledTransactionManagerConfig<
  CustomLabels extends readonly string[] = readonly [],
> = { customLabels?: CustomLabels } & (
  | (Omit<
      MultiLabeledCounterMetricConfiguration<PrometheusTransactionManagerLabels<CustomLabels>>,
      'labelNames'
    > & {
      type: 'counter'
    })
  | (Omit<
      HistogramMetricConfiguration<PrometheusTransactionManagerLabels<CustomLabels>>,
      'labelNames'
    > & {
      type: 'histogram'
    })
)

/**
 * TransactionObservabilityManager implementation backed by a Prometheus counter OR histogram.
 *
 * - `counter` mode: increments a counter on `stop()` with labels `{ status, transaction_name, ...customLabels }`.
 * - `histogram` mode: observes the transaction duration (in milliseconds) on `stop()` with the same label
 *   set. The histogram exposes `${name}_count` and `${name}_sum` automatically, so a separate counter is
 *   not needed.
 *
 * `status` is always `'success'` or `'error'` (determined by the `wasSuccessful` flag passed to `stop()`).
 * `transaction_name` is the `transactionName` supplied to `start()` / `startWithGroup()`.
 *
 * Custom labels must be declared up-front via `config.customLabels`. Values are supplied at runtime through
 * `addCustomAttributes()`; attributes whose keys are not in the declared set are silently ignored.
 */
export class PrometheusLabeledTransactionManager<
  CustomLabels extends readonly string[] = readonly [],
> extends AbstractPrometheusTransactionManager {
  private readonly supportedCustomLabels: Set<string>
  private readonly counter?: ManagerLabeledCounter<CustomLabels>
  private readonly histogram?: ManagerLabeledHistogram<CustomLabels>
  private readonly customLabelsByKey = new Map<
    string,
    Record<CustomLabels[number], string | number>
  >()

  constructor(
    config: PrometheusLabeledTransactionManagerConfig<CustomLabels>,
    client?: typeof promClient,
  ) {
    super()
    this.supportedCustomLabels = new Set(config.customLabels ?? [])

    const labelNames = [
      ...prometheusTransactionManagerBuiltInLabels,
      ...(config.customLabels ?? []),
    ]

    if (config.type === 'counter') {
      this.counter = new ManagerLabeledCounter<CustomLabels>(
        { name: config.name, helpDescription: config.helpDescription, labelNames },
        client,
      )
    } else if (config.type === 'histogram') {
      this.histogram = new ManagerLabeledHistogram<CustomLabels>(
        {
          name: config.name,
          helpDescription: config.helpDescription,
          labelNames,
          buckets: config.buckets,
        },
        client,
      )
    }
  }

  protected override emitMeasurement(
    uniqueTransactionKey: string,
    transactionName: string,
    status: TransactionStatus,
    durationMs: number,
  ): void {
    const customLabels =
      this.customLabelsByKey.get(uniqueTransactionKey) ??
      ({} as Record<CustomLabels[number], string | number>)

    if (this.counter) {
      this.counter.registerMeasurement({
        status,
        transaction_name: transactionName,
        ...customLabels,
        increment: 1,
      })
    } else if (this.histogram) {
      this.histogram.registerMeasurement({
        status,
        transaction_name: transactionName,
        ...customLabels,
        time: durationMs,
      })
    }

    this.customLabelsByKey.delete(uniqueTransactionKey)
  }

  /**
   * Stores the supported custom label values for the given transaction. Any attribute whose key is not in
   * the set declared via `config.customLabels` is silently ignored. Boolean values are coerced to strings
   * (`"true"` / `"false"`) because prom-client only accepts `string | number` as label values.
   */
  override addCustomAttributes(
    uniqueTransactionKey: string,
    attributes: Record<string, string | number | boolean>,
  ): void {
    if (!this.transactionNameByKey.has(uniqueTransactionKey)) return

    const filtered: Record<string, string | number> = {}
    for (const [key, value] of Object.entries(attributes)) {
      if (this.supportedCustomLabels.has(key)) {
        filtered[key] = typeof value === 'boolean' ? String(value) : value
      }
    }

    this.customLabelsByKey.set(uniqueTransactionKey, filtered)
  }
}
