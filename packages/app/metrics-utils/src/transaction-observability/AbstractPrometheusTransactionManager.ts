import type { TransactionObservabilityManager } from '@lokalise/node-core'
import type { TransactionStatus } from './utils.ts'

export abstract class AbstractPrometheusTransactionManager
  implements TransactionObservabilityManager
{
  protected readonly transactionNameByKey = new Map<string, string>()
  protected readonly startTimeByKey = new Map<string, number>()

  start(transactionName: string, uniqueTransactionKey: string): void {
    this.transactionNameByKey.set(uniqueTransactionKey, transactionName)
    this.startTimeByKey.set(uniqueTransactionKey, Date.now())
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
    if (transactionName === undefined) return

    const startTime = this.startTimeByKey.get(uniqueTransactionKey) ?? Date.now()

    try {
      this.emitMeasurement(
        uniqueTransactionKey,
        transactionName,
        wasSuccessful ? 'success' : 'error',
        Date.now() - startTime,
      )
    } finally {
      this.transactionNameByKey.delete(uniqueTransactionKey)
      this.startTimeByKey.delete(uniqueTransactionKey)
    }
  }

  abstract addCustomAttributes(
    uniqueTransactionKey: string,
    attributes: Record<string, string | number | boolean>,
  ): void

  protected abstract emitMeasurement(
    uniqueTransactionKey: string,
    transactionName: string,
    status: TransactionStatus,
    durationMs: number,
  ): void
}
