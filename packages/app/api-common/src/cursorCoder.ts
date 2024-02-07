import { isObject } from './typeUtils'

export const encodeCursor = (object: Record<string, unknown>): string =>
	Buffer.from(JSON.stringify(object)).toString('base64url')

export const decodeCursor = (value: string): Record<string, unknown> => {
	const decoded = Buffer.from(value, 'base64url').toString('utf-8')
	const result: unknown = JSON.parse(decoded)
	if (result && isObject(result)) {
		return result
	}
	throw new Error('Invalid cursor')
}
