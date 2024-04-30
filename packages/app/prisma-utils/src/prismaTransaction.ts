import type { Either } from '@lokalise/node-core'

import type { PrismaClient, Prisma } from '@prisma/client'
import type * as runtime from '@prisma/client/runtime/library'

import { isPrismaClientKnownRequestError, PRISMA_SERIALIZATION_ERROR } from './prismaError'
import type { Types } from '@prisma/client/runtime/library'

export type PrismaTransactionOptions = {
	retriesAllowed: number
	maxWait?: number
	timeout?: number
	isolationLevel?: string
}

export type PrismaTransactionBasicOptions = Pick<
	PrismaTransactionOptions,
	'retriesAllowed' | 'isolationLevel'
>

export type PrismaTransactionClient = Omit<PrismaClient, runtime.ITXClientDenyList>

export type PrismaTransactionFn<T> = (prisma: PrismaTransactionClient) => Promise<T>

type PrismaTransactionReturnType<T> = Either<
	unknown,
	T | Types.Utils.UnwrapTuple<Prisma.PrismaPromise<unknown>[]>
>

/**
 * Perform a Prisma DB transaction with automatic retries if needed.
 *
 * @template T | T extends Prisma.PrismaPromise<unknown>[]
 * @param {PrismaClient} prisma
 * @param {PrismaTransactionFn<T> | Prisma.PrismaPromise<unknown>[]} arg		 operation to perform into the transaction
 * @param {PrismaTransactionOptions | PrismaTransactionBasicOptions} options transaction configuration
 * @return {Promise<PrismaTransactionReturnType<T>>}
 */
export const prismaTransaction = (async <T>(
	prisma: PrismaClient,
	arg: PrismaTransactionFn<T>,
	options: PrismaTransactionOptions = { retriesAllowed: 3 },
): Promise<PrismaTransactionReturnType<T>> => {
	let result: PrismaTransactionReturnType<T> | undefined = undefined

	let retries = 0
	while (retries < options.retriesAllowed) {
		result = await executeTransactionTry(prisma, arg, options)

		if (
			result.result ||
			!isPrismaClientKnownRequestError(result.error) ||
			result.error.code !== PRISMA_SERIALIZATION_ERROR
		) {
			break
		}

		retries++
	}

	return result ?? { error: new Error('No transaction retry executed') }
}) as {
	<T>(
		prisma: PrismaClient,
		fn: PrismaTransactionFn<T>,
		options?: PrismaTransactionOptions,
	): Promise<Either<unknown, T>>
	<T extends Prisma.PrismaPromise<unknown>[]>(
		prisma: PrismaClient,
		args: [...T],
		options?: PrismaTransactionBasicOptions,
	): Promise<Either<unknown, runtime.Types.Utils.UnwrapTuple<T>>>
}

const executeTransactionTry = async <T>(
	prisma: PrismaClient,
	arg: PrismaTransactionFn<T>,
	options: PrismaTransactionOptions,
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
