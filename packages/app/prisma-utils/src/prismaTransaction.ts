import { setTimeout } from 'node:timers/promises'

import type { Either } from '@lokalise/node-core'
import type { PrismaClient, Prisma } from '@prisma/client'
import type * as runtime from '@prisma/client/runtime/library'

import { isCockroachDBRetryTransaction } from './cockroachdbError'
import {
	isPrismaClientKnownRequestError,
	isPrismaTransactionClosedError,
	PRISMA_SERIALIZATION_ERROR,
} from './prismaError'
import type {
	DbDriver,
	PrismaTransactionBasicOptions,
	PrismaTransactionFn,
	PrismaTransactionOptions,
	PrismaTransactionReturnType,
} from './types'

const DEFAULT_OPTIONS = {
	retriesAllowed: 3,
	DbDriver: 'CockroachDb',
	baseRetryDelayMs: 100,
	maxRetryDelayMs: 30000, // 30s
	timeout: 5000, // 5s
	maxTimeout: 30000, // 30s
} satisfies Partial<PrismaTransactionOptions>

/**
 * Perform a Prisma DB transaction with automatic retries if needed.
 *
 * @template T | T extends Prisma.PrismaPromise<unknown>[]
 * @param {PrismaClient} prisma
 * @param {PrismaTransactionFn<T> | Prisma.PrismaPromise<unknown>[]} arg	 operation to perform into the transaction
 * @param {PrismaTransactionOptions | PrismaTransactionBasicOptions} options transaction configuration
 * @return {Promise<PrismaTransactionReturnType<T>>}
 */
export const prismaTransaction = (async <T, P extends PrismaClient>(
	prisma: P,
	arg: PrismaTransactionFn<T, P> | Prisma.PrismaPromise<unknown>[],
	options?: PrismaTransactionOptions | PrismaTransactionBasicOptions,
): Promise<PrismaTransactionReturnType<T>> => {
	let optionsWithDefaults = { ...DEFAULT_OPTIONS, ...options }
	let result: PrismaTransactionReturnType<T> | undefined = undefined

	let retries = 0
	while (retries < optionsWithDefaults.retriesAllowed) {
		if (retries > 0) {
			await setTimeout(
				calculateRetryDelay(
					retries,
					optionsWithDefaults.baseRetryDelayMs,
					optionsWithDefaults.maxRetryDelayMs,
				),
			)
		}

		result = await executeTransactionTry(prisma, arg, optionsWithDefaults)
		if (result.result) break

		const retryAllowed = isRetryAllowed(result, optionsWithDefaults.DbDriver)
		if (!retryAllowed) break

		if (retryAllowed === 'increase-timeout') {
			optionsWithDefaults = {
				...optionsWithDefaults,
				timeout: Math.min((optionsWithDefaults.timeout *= 2), optionsWithDefaults.maxTimeout),
			}
		}

		retries++
	}

	return result ?? { error: new Error('No transaction retry executed') }
}) as {
	<T, P extends PrismaClient>(
		prisma: P,
		fn: PrismaTransactionFn<T, P>,
		options?: PrismaTransactionOptions,
	): Promise<Either<unknown, T>>
	<T extends Prisma.PrismaPromise<unknown>[], P extends PrismaClient>(
		prisma: P,
		args: [...T],
		options?: PrismaTransactionBasicOptions,
	): Promise<Either<unknown, runtime.Types.Utils.UnwrapTuple<T>>>
}

const executeTransactionTry = async <T, P extends PrismaClient>(
	prisma: P,
	arg: PrismaTransactionFn<T, P> | Prisma.PrismaPromise<unknown>[],
	options?: PrismaTransactionOptions,
): Promise<PrismaTransactionReturnType<T>> => {
	try {
		return {
			// @ts-ignore
			result: await prisma.$transaction<T>(arg, options),
		}
	} catch (error) {
		return { error }
	}
}

const calculateRetryDelay = (
	retries: number,
	baseRetryDelayMs: number,
	maxDelayMs: number,
): number => {
	// exponential backoff -> 2^(retry-1) * baseRetryDelayMs
	const expDelay = Math.pow(2, retries - 1) * baseRetryDelayMs
	return Math.min(expDelay, maxDelayMs)
}

type isRetryAllowedResult = boolean | 'increase-timeout'

const isRetryAllowed = <T>(
	result: PrismaTransactionReturnType<T>,
	dbDriver: DbDriver,
): isRetryAllowedResult => {
	if (isPrismaClientKnownRequestError(result.error)) {
		const error = result.error
		if (error.code === PRISMA_SERIALIZATION_ERROR) return true
		if (dbDriver === 'CockroachDb' && isCockroachDBRetryTransaction(error)) return true
		if (isPrismaTransactionClosedError(error)) return 'increase-timeout'
	}

	return false
}
