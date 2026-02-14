import type { Either } from '@lokalise/node-core'
import type * as RuntimePrisma from '@prisma/client/runtime/client'
import type { DbDriver } from '../types.ts'

type InternalTransactionOptions = RuntimePrisma.PrismaClientOptions['transactionOptions']

export type PrismaTransactionOptions = {
  dbDriver?: DbDriver // default: CockroachDb
  retriesAllowed?: number
  baseRetryDelayMs?: number
  maxRetryDelayMs?: number
  maxTimeout?: number
} & InternalTransactionOptions

export type PrismaTransactionClient<P> = Omit<P, RuntimePrisma.ITXClientDenyList>

export type PrismaTransactionFn<T, P> = (prisma: PrismaTransactionClient<P>) => Promise<T>

export type PrismaTransactionReturnType<T> = Either<
  unknown,
  T | RuntimePrisma.Types.Utils.UnwrapTuple<RuntimePrisma.PrismaPromise<unknown>[]>
>
