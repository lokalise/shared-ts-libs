import type { TransactionObservabilityManager } from '@lokalise/node-core'

/**
 * Optional capability of a `TransactionObservabilityManager`: making the transaction it
 * started the active one for the duration of a callback.
 *
 * It is not part of the `TransactionObservabilityManager` contract (starting and stopping a
 * transaction are two separate calls, which cannot express a scope), so implementations opt
 * in by exposing this method - the OpenTelemetry manager from `@lokalise/fastify-extras`
 * does.
 */
type ContextPropagatingObservabilityManager = {
  runInSpanContext: <T>(uniqueTransactionKey: string, fn: () => T) => T
}

const canPropagateContext = (
  manager: TransactionObservabilityManager | undefined,
): manager is TransactionObservabilityManager & ContextPropagatingObservabilityManager =>
  typeof (manager as ContextPropagatingObservabilityManager | undefined)?.runInSpanContext ===
  'function'

/**
 * Runs the given function within the observability context of an already started transaction,
 * so that everything traced while the job executes (database queries, outgoing HTTP calls,
 * nested spans) is attached to the job transaction instead of ending up as a detached root.
 *
 * Falls back to plain execution when the manager cannot propagate context, so a job never
 * fails because of its observability tooling.
 */
export const runInTransactionContext = <T>(
  manager: TransactionObservabilityManager | undefined,
  uniqueTransactionKey: string,
  fn: () => T,
): T => (canPropagateContext(manager) ? manager.runInSpanContext(uniqueTransactionKey, fn) : fn())
