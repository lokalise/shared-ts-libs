import type { Either } from '@lokalise/node-core'
import { failure, success } from '@lokalise/node-core'

import { isObject } from './typeUtils'

export const encodeCursor = (object: Record<string, unknown>): string =>
	Buffer.from(JSON.stringify(object)).toString('base64url')

export const decodeCursor = (value: string): Either<Error, Record<string, unknown>> => {
	let error: unknown
	try {
		const decoded = Buffer.from(value, 'base64url').toString('utf-8')
		const result: unknown = JSON.parse(decoded)
		if (result && isObject(result)) {
			return success(result)
		}
	} catch (e) {
		error = e
	}

	/* v8 ignore next */
	return failure(error instanceof Error ? error : new Error('Invalid cursor'))
}
