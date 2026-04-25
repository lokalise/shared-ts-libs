import type promClient from 'prom-client'
import { AbstractPrometheusTransactionManager } from './AbstractPrometheusTransactionManager.ts'
import {
  ManagerLabeledCounter,
  type ManagerLabeledCounterBaseConfig,
  ManagerLabeledHistogram,
  type ManagerLabeledHistogramBaseConfig,
  prometheusTransactionManagerBuiltInLabels,
  type TransactionStatus,
} from './utils.ts'

export type PrometheusLabeledTransactionManagerConfig<
  CustomLabels extends readonly string[] = readonly [],
> = { customLabels?: CustomLabels } & (
  | (ManagerLabeledCounterBaseConfig<CustomLabels> & { type: 'counter' })
  | (ManagerLabeledHistogramBaseConfig<CustomLabels> & { type: 'histogram' })
)

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

    this.counter?.registerMeasurement({
      status,
      transaction_name: transactionName,
      ...customLabels,
      increment: 1,
    })
    this.histogram?.registerMeasurement({
      status,
      transaction_name: transactionName,
      ...customLabels,
      time: durationMs,
    })

    this.customLabelsByKey.delete(uniqueTransactionKey)
  }

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
