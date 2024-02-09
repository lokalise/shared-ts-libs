import { isObject } from './typeUtils'

type Left<T> = {
	error: T
	result?: never
}

type Right<U> = {
	error?: never
	result: U
}

export type Either<T, U> = NonNullable<Left<T> | Right<U>>

export const encodeCursor = (object: Record<string, unknown>): string =>
	Buffer.from(JSON.stringify(object)).toString('base64url')

export const decodeCursor = (value: string): Either<Error, Record<string, unknown>> => {
	let error: unknown
	try {
		const decoded = Buffer.from(value, 'base64url').toString('utf-8')
		const result: unknown = JSON.parse(decoded)
		if (result && isObject(result)) {
			return { result }
		}
	} catch (e) {
		error = e
	}

	/* v8 ignore next */
	return { error: error instanceof Error ? error : new Error('Invalid cursor') }
}
