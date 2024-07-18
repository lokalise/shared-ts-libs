import type { Either } from '@lokalise/node-core'
import type { Prisma } from '@prisma/client'
import type * as runtime from '@prisma/client/runtime/library'
import type { CockroachDbIsolationLevel } from './isolation_level/isolationLevel'

type ObjectValues<T> = T[keyof T]

export const DbDriverEnum = {
  COCKROACHDB: 'CockroachDb',
} as const
export type DbDriver = ObjectValues<typeof DbDriverEnum>

export type PrismaTransactionOptions = {
  // Prisma utils library custom options
  DbDriver?: DbDriver
  retriesAllowed?: number
  baseRetryDelayMs?: number
  maxRetryDelayMs?: number
  maxTimeout?: number

  // Prisma $transaction options
  maxWait?: number
  timeout?: number
  /*
    For not library only supports CockroachDB, when we add support for other databases we need to update this to
    use union types and depending on DbDriver allow different isolation levels
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
