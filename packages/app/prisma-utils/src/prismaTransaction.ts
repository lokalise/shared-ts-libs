import { setTimeout } from 'node:timers/promises'
import type { Either } from '@lokalise/node-core'
import { deepClone } from '@lokalise/node-core'
import type { Prisma, PrismaClient } from '@prisma/client'
import type * as runtime from '@prisma/client/runtime/library'
import { isCockroachDBRetryTransaction } from './errors/cockroachdbError.ts'
import {
  isPrismaClientKnownRequestError,
  isPrismaTransactionClosedError,
  PRISMA_SERIALIZATION_ERROR,
  PRISMA_SERVER_CLOSED_CONNECTION_ERROR,
  PRISMA_TRANSACTION_ERROR,
} from './errors/prismaError.ts'
import type {
  DbDriver,
  PrismaTransactionBasicOptions,
  PrismaTransactionFn,
  PrismaTransactionOptions,
  PrismaTransactionReturnType,
} from './types.ts'

const DEFAULT_OPTIONS = {
  retriesAllowed: 2, // first try + 2 retries = 3 tries
  dbDriver: 'CockroachDb',
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
  let result: PrismaTransactionReturnType<T> | undefined

  let retries = 0
  do {
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

    const retryAllowed = isRetryAllowed(result, optionsWithDefaults.dbDriver)
    if (!retryAllowed) break

    if (retryAllowed === 'increase-timeout') {
      optionsWithDefaults = deepClone(optionsWithDefaults)
      optionsWithDefaults.timeout = Math.min(
        optionsWithDefaults.timeout * 2,
        optionsWithDefaults.maxTimeout,
      )
    }

    retries++
  } while (retries <= optionsWithDefaults.retriesAllowed)

  return result ?? { error: new Error('No transaction executed') }
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

const PrismaCodesToRetry = [
  PRISMA_SERIALIZATION_ERROR,
  PRISMA_SERVER_CLOSED_CONNECTION_ERROR,
  PRISMA_TRANSACTION_ERROR,
]
type isRetryAllowedResult = boolean | 'increase-timeout'

const isRetryAllowed = <T>(
  result: PrismaTransactionReturnType<T>,
  dbDriver: DbDriver,
): isRetryAllowedResult => {
  if (isPrismaClientKnownRequestError(result.error)) {
    const error = result.error
    // in case transaction is closed (timeout), retry increasing the timeout
    // this should be the first check as the code error is PRISMA_TRANSACTION_ERROR covered also in the next check
    if (isPrismaTransactionClosedError(error)) return 'increase-timeout'
    // retry if the error code is in the list of codes to retry
    if (PrismaCodesToRetry.includes(error.code)) return true
    // retry if the error is a CockroachDB retry transaction error
    if (dbDriver === 'CockroachDb' && isCockroachDBRetryTransaction(error)) return true
  }

  return false
}
