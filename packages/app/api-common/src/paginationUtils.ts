import { pick } from '@lokalise/node-core'

import type { PaginationMeta, OptionalPaginationParams } from './apiSchemas'
import { encodeCursor } from './cursorCodec'

/**
 * Constructs a PaginationMeta object encapsulating the total count and the cursor for fetching the next page.
 *
 * The resultant cursor can be either a simple string or an encoded string based on the 'cursorKeys' parameter.
 * 	- If 'cursorKeys' is undefined or empty, the cursor will default to the 'id' property of the last element in 'data'.
 * 	- If 'cursorKeys' contains a single key, the cursor will correspond to the value of that key from the last element
 * 		in 'data'.
 * 	- If 'cursorKeys' features multiple keys, the cursor will be an encoded string incorporating the values of these
 * 		keys from the last element in 'data'.
 *
 * @param data - A generic array of objects, each object expected to extend { id: string }.
 * @param cursorKeys - An optional array of keys that determine the formation of the cursor. By default, this uses
 * 	the 'id' property.
 *
 * @returns PaginationMeta - An object detailing two crucial properties required for effective pagination: total item
 * 	count and the cursor.
 */
export function getMetaFor<T extends { id: string }, K extends keyof T>(
	data: T[],
	cursorKeys?: K[],
): PaginationMeta {
	if (data.length === 0) {
		return { count: 0 }
	}

	const lastElement = data[data.length - 1]
	let cursor: string = ''
	if (cursorKeys === undefined || cursorKeys.length === 0) {
		cursor = lastElement.id
	} else {
		cursor =
			cursorKeys.length === 1
				? (lastElement[cursorKeys[0]] as string)
				: encodeCursor(pick(lastElement, cursorKeys))
	}

	return {
		count: data.length,
		cursor,
	}
}

type PaginatedResponse<T> = {
	data: T[]
	meta: PaginationMeta
}

export async function getPaginatedEntries<T>(
	pagination: OptionalPaginationParams,
	apiCall: (params: OptionalPaginationParams) => Promise<PaginatedResponse<T>>,
): Promise<T[]> {
	const resultArray: T[] = []
	let currentCursor: string | undefined = undefined
	do {
		const pageResult = await apiCall({ ...pagination, after: currentCursor })
		resultArray.push(...pageResult.data)
		currentCursor = pageResult.meta.cursor
	} while (currentCursor)

	return resultArray
}
