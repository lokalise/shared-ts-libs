import type { Either } from '@lokalise/node-core'
import type * as RuntimePrisma from '@prisma/client/runtime/client'

type ObjectValues<T> = T[keyof T]
type InternalTransactionOptions = RuntimePrisma.PrismaClientOptions['transactionOptions']

export const DbDriverEnum = {
  COCKROACHDB: 'CockroachDb',
} as const
export type DbDriver = ObjectValues<typeof DbDriverEnum>

//----------------------------------------
// Prisma transaction types
//----------------------------------------
export type PrismaTransactionOptions = {
  // Prisma utils library custom options
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
