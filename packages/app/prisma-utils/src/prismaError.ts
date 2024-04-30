import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { isError } from '@lokalise/node-core'

/**
 * What is checked?
 * 	1. error is defined and not null
 * 	2. error is an `Error`
 * 	3. error contains the field code which is a string
 * 	4. code starts by `P` ([doc](https://www.prisma.io/docs/reference/api-reference/error-reference#error-codes))
 */
export const isPrismaClientKnownRequestError = (
	error: unknown,
): error is PrismaClientKnownRequestError =>
	!!error &&
	isError(error) &&
	'code' in error &&
	typeof error.code === 'string' &&
	error.code.startsWith('P')

/*
 * Prisma error code P2025 indicates that the operation failed because it depends on one or more
 * records that were required but not found
 */
export const PRISMA_NOT_FOUND_ERROR = 'P2025'

/*
 * Prisma error code P2034 indicates a serialization error and that the transaction must be retried.
 * A different error code would indicate that an internal state error happened and that
 * the cluster itself is experiencing an issue which requires intervention
 */
export const PRISMA_SERIALIZATION_ERROR = 'P2034'

/*
 * Prisma error code P2002 indicates that the operation failed because a unique constraint was
 * violated. This can happen if you try to create a record with a unique field that already exists
 */
export const PRISMA_UNIQUE_CONSTRAINT_ERROR = 'P2002'
