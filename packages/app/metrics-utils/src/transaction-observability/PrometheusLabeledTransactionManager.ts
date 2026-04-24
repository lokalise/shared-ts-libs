import type { TransactionObservabilityManager } from '@lokalise/node-core'
import type promClient from 'prom-client'
import type { HistogramMetricConfiguration } from '../labeled/AbstractLabeledHistogramMetric.ts'
import type { MultiLabeledCounterMetricConfiguration } from '../labeled/AbstractMultiLabeledCounterMetric.ts'
import {
  LabeledCounter,
  LabeledHistogram,
  prometheusTransactionManagerBuiltInLabels,
  type PrometheusTransactionManagerLabels,
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
 * - `histogram` mode: observes the transaction duration on `stop()` with the same label set. The histogram
 *   exposes `${name}_count` and `${name}_sum` automatically, so a separate counter is not needed.
 *
 * `status` is always `'success'` or `'error'` (determined by the `wasSuccessful` flag passed to `stop()`).
 * `transaction_name` is the `transactionName` supplied to `start()` / `startWithGroup()`.
 *
 * Custom labels must be declared up-front via `config.customLabels`. Values are supplied at runtime through
 * `addCustomAttributes()`; attributes whose keys are not in the declared set are silently ignored.
 */
export class PrometheusLabeledTransactionManager<
  CustomLabels extends readonly string[] = readonly [],
> implements TransactionObservabilityManager
{
  private readonly supportedCustomLabels: Set<string>
  private readonly counter?: LabeledCounter<CustomLabels>
  private readonly histogram?: LabeledHistogram<CustomLabels>

  private readonly transactionNameByKey = new Map<string, string>()
  private readonly startTimeByKey = new Map<string, number>()
  private readonly customLabelsByKey = new Map<
    string,
    Record<CustomLabels[number], string | number>
  >()

  constructor(
    config: PrometheusLabeledTransactionManagerConfig<CustomLabels>,
    client?: typeof promClient,
  ) {
    this.supportedCustomLabels = new Set(config.customLabels ?? [])

    const labelNames = [
      ...prometheusTransactionManagerBuiltInLabels,
      ...(config.customLabels ?? []),
    ]

    if (config.type === 'counter') {
      this.counter = new LabeledCounter<CustomLabels>(
        { name: config.name, helpDescription: config.helpDescription, labelNames },
        client,
      )
    } else if (config.type === 'histogram') {
      this.histogram = new LabeledHistogram<CustomLabels>(
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

  start(transactionName: string, uniqueTransactionKey: string): void {
    this.transactionNameByKey.set(uniqueTransactionKey, transactionName)
    if (this.histogram) this.startTimeByKey.set(uniqueTransactionKey, Date.now())
  }

  startWithGroup(
    transactionName: string,
    uniqueTransactionKey: string,
    _transactionGroup: string,
  ): void {
    this.start(transactionName, uniqueTransactionKey)
  }

  stop(uniqueTransactionKey: string, wasSuccessful = true): void {
    const transactionName = this.transactionNameByKey.get(uniqueTransactionKey)
    if (!transactionName) return

    const status = wasSuccessful ? 'success' : 'error'
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
      const startTime = this.startTimeByKey.get(uniqueTransactionKey) ?? Date.now()
      const endTime = Date.now()
      this.histogram.registerMeasurement({
        status,
        transaction_name: transactionName,
        ...customLabels,
        startTime,
        endTime,
      })
    }

    this.transactionNameByKey.delete(uniqueTransactionKey)
    this.startTimeByKey.delete(uniqueTransactionKey)
    this.customLabelsByKey.delete(uniqueTransactionKey)
  }

  /**
   * Stores the supported custom label values for the given transaction. Any attribute whose key is not in
   * the set declared via `config.customLabels` is silently ignored. Boolean values are coerced to strings
   * (`"true"` / `"false"`) because prom-client only accepts `string | number` as label values.
   */
  addCustomAttributes(
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
