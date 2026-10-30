import type { PrismaClientKnownRequestError } from '@prisma/client/runtime/client'

/**
 * https://www.cockroachlabs.com/docs/stable/transaction-retry-error-reference#:~:text=To%20indicate%20that%20a%20transaction,the%20string%20%22restart%20transaction%22%20.
 *
 * All transaction retry errors use the SQLSTATE error code 40001
 */
const COCKROACHDB_RETRY_TRANSACTION_CODE = '40001'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * Check if the error is a CockroachDB transaction retry error
 *
 * Two shapes carry the SQLSTATE, depending on how the query reached the database:
 *  - the Rust query engine reports it flat, as `meta.code`
 *  - a driver adapter (e.g. `@prisma/adapter-pg`) reports a `P2010` whose SQLSTATE is nested
 *    under `meta.driverAdapterError.cause.originalCode`, with no `meta.code` at all
 *
 * @param error
 */
export const isCockroachDBRetryTransaction = (error: PrismaClientKnownRequestError): boolean => {
  const meta = error.meta
  if (!isRecord(meta)) return false

  if (meta.code === COCKROACHDB_RETRY_TRANSACTION_CODE) return true

  const driverAdapterError = meta.driverAdapterError
  if (!isRecord(driverAdapterError)) return false

  const cause = driverAdapterError.cause
  if (!isRecord(cause)) return false

  return cause.originalCode === COCKROACHDB_RETRY_TRANSACTION_CODE
}
