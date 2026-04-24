import type { TransactionObservabilityManager } from '@lokalise/node-core'
import type { TransactionStatus } from './utils.ts'

/**
 * Shared state + lifecycle for all Prometheus-backed `TransactionObservabilityManager` implementations.
 *
 * Concrete subclasses only need to:
 * - Implement `emitMeasurement(uniqueTransactionKey, transactionName, status, durationMs)` — the actual
 *   metric emission. Subclasses that maintain their own per-transaction state (e.g. custom labels)
 *   should also clean it up inside this method, using the provided key.
 * - Optionally override `addCustomAttributes(key, attributes)` if they support per-transaction custom labels
 *   (default is a no-op, which is the correct behavior for backends that do not support Prometheus labels).
 */
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
    if (!transactionName) return

    const status: 'success' | 'error' = wasSuccessful ? 'success' : 'error'
    const startTime = this.startTimeByKey.get(uniqueTransactionKey) ?? Date.now()
    const durationMs = Date.now() - startTime

    this.emitMeasurement(uniqueTransactionKey, transactionName, status, durationMs)

    this.transactionNameByKey.delete(uniqueTransactionKey)
    this.startTimeByKey.delete(uniqueTransactionKey)
  }

  /**
   * Default implementation is a no-op. Override in subclasses that support custom labels (e.g. the
   * labeled variant). Backends that do not support labels (e.g. the dimensional variant) keep the
   * default — custom attributes are silently dropped, the consumer is expected to capture them via a
   * sibling manager (typically OpenTelemetry) composed through `MultiTransactionObservabilityManager`.
   */
  addCustomAttributes(
    _uniqueTransactionKey: string,
    _attributes: Record<string, string | number | boolean>,
  ): void {
    // no-op by default
  }

  /**
   * Emits the actual Prometheus metric for the completed transaction. Subclasses decide what to emit
   * (counter vs histogram, labeled vs dimensional) and how to encode `status` / `transactionName`.
   */
  protected abstract emitMeasurement(
    uniqueTransactionKey: string,
    transactionName: string,
    status: TransactionStatus,
    durationMs: number,
  ): void
}
