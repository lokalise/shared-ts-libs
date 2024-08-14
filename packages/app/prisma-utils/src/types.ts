import type { Either } from '@lokalise/node-core'
import type { Prisma } from '@prisma/client'
import type * as runtime from '@prisma/client/runtime/library'
import type { CockroachDbIsolationLevel } from './isolation_level/isolationLevel'

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
  isolationLevel?: CockroachDbIsolationLevel
}

// Prisma $transaction with array does not support maxWait and timeout options
export type PrismaTransactionBasicOptions = Omit<
  PrismaTransactionOptions,
  'maxWait' | 'timeout' | 'maxTimeout'
>

export type PrismaTransactionClient<P> = Omit<P, runtime.ITXClientDenyList>

export type PrismaTransactionFn<T, P> = (prisma: PrismaTransactionClient<P>) => Promise<T>

export type PrismaTransactionReturnType<T> = Either<
  unknown,
  T | runtime.Types.Utils.UnwrapTuple<Prisma.PrismaPromise<unknown>[]>
>

//----------------------------------------
// Prisma client factory types
//----------------------------------------

/**
 * If we try to use `Omit<Prisma.PrismaClientOptions['transactionOptions'], 'isolationLevel'>` to override isolationLevel
 * we start to get lint errors about maxWait and timeout not being part of the transactionOptions type.
 *
 * for that reason, and as this is a temporal solution in the meantime Prisma includes ReadCommitted as a valid isolation
 * level for CockroachDB, we are using this type to override the transactionOptions which is basically a copy of
 * Prisma.PrismaClientOptions['transactionOptions']
 */
type PrismaClientTransactionOptions = {
  isolationLevel?: CockroachDbIsolationLevel
  maxWait?: number
  timeout?: number
}

/**
 * this is a temporal solution in the meantime Prisma includes ReadCommitted as a valid isolation level for CockroachDB
 */
export type PrismaClientFactoryOptions = Omit<Prisma.PrismaClientOptions, 'transactionOptions'> & {
  dbDriver?: DbDriver // default: CockroachDb
  transactionOptions?: PrismaClientTransactionOptions
}
