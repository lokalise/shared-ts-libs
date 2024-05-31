import type * as runtime from '@prisma/client/runtime/library'

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

	// Prisma $transaction options
	maxWait?: number
	timeout?: number
	isolationLevel?: string
}

// Prisma $transaction with array does not support maxWait and timeout options
export type PrismaTransactionBasicOptions = Omit<PrismaTransactionOptions, 'maxWait' | 'timeout'>

export type PrismaTransactionClient<P> = Omit<P, runtime.ITXClientDenyList>

export type PrismaTransactionFn<T, P> = (prisma: PrismaTransactionClient<P>) => Promise<T>
