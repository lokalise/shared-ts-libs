import type { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'

/**
 * https://www.cockroachlabs.com/docs/stable/transaction-retry-error-reference#:~:text=To%20indicate%20that%20a%20transaction,the%20string%20%22restart%20transaction%22%20.
 *
 * All transaction retry errors use the SQLSTATE error code 40001, and emit error messages with the string restart transaction. Further, each error includes a specific error code to assist with targeted troubleshooting
 */
const COCKROACHDB_RETRY_TRANSACTION_CODE = '40001'
const COCKROACHDB_RETRY_TRANSACTION_MESSAGE = 'restart transaction'

/**
 * Check if the error is a CockroachDB transaction retry error
 *
 * @param error
 */
export const isCockroachDBRetryTransaction = (error: PrismaClientKnownRequestError): boolean => {
	const meta = error.meta
	if (!meta) return false

	return (
		meta.code === COCKROACHDB_RETRY_TRANSACTION_CODE &&
		typeof meta.message === 'string' &&
		meta.message.includes(COCKROACHDB_RETRY_TRANSACTION_MESSAGE)
	)
}
