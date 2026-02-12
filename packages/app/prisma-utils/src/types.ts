import type { Either } from '@lokalise/node-core'
import type * as RuntimePrisma from '@prisma/client/runtime/client'

type ObjectValues<T> = T[keyof T]

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

  // Prisma $transaction options
  maxWait?: number
  timeout?: number
  /*
    For now library only supports CockroachDB, when we add support for other databases we need to update this to
    use union types and depending on DbDriver allow different isolation levels

    Also, this is a temporal solution in the meantime Prisma includes ReadCommitted as a valid isolation level for CockroachDB
   */
  isolationLevel?: undefined // TODO
}

// Prisma $transaction with array does not support maxWait and timeout options
export type PrismaTransactionBasicOptions = Omit<
  PrismaTransactionOptions,
  'maxWait' | 'timeout' | 'maxTimeout'
>

export type PrismaTransactionClient<P> = Omit<P, RuntimePrisma.ITXClientDenyList>

export type PrismaTransactionFn<T, P> = (prisma: PrismaTransactionClient<P>) => Promise<T>

export type PrismaTransactionReturnType<T> = Either<
  unknown,
  T | RuntimePrisma.Types.Utils.UnwrapTuple<RuntimePrisma.PrismaPromise<unknown>[]>
>
