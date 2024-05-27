import type * as runtime from '@prisma/client/runtime/library'

type ObjectValues<T> = T[keyof T]

export const DbDriverEnum = {
	COCKROACHDB: 'CockroachDb',
} as const
export type DbDriver = ObjectValues<typeof DbDriverEnum>

export type PrismaTransactionOptions = {
	retriesAllowed: number
	maxWait?: number
	timeout?: number
	isolationLevel?: string
	DbDriver?: DbDriver
}

export type PrismaTransactionBasicOptions = Pick<
	PrismaTransactionOptions,
	'retriesAllowed' | 'isolationLevel' | 'DbDriver'
>

export type PrismaTransactionClient<P> = Omit<P, runtime.ITXClientDenyList>

export type PrismaTransactionFn<T, P> = (prisma: PrismaTransactionClient<P>) => Promise<T>
