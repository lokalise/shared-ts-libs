import type { PaginationMeta, OptionalPaginationParams } from './apiSchemas'
import { encodeCursor } from './cursorCodec'

const pick = <T, K extends string | number | symbol>(
	source: T,
	propNames: readonly K[],
): Pick<T, Exclude<keyof T, Exclude<keyof T, K>>> => {
	const result = {} as T
	let idx = 0
	while (idx < propNames.length) {
		// @ts-ignore
		if (propNames[idx] in source) {
			// @ts-ignore
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			result[propNames[idx]] = source[propNames[idx]]
		}
		idx += 1
	}
	return result
}

/**
 * Constructs a PaginationMeta object encapsulating the total count and the cursor for fetching the next page.
 *
 * The resultant cursor can be either a simple string or an encoded string based on the 'cursorKeys' parameter.
 * 	- If 'cursorKeys' is undefined, the cursor will default to the 'id' property of the last element in 'data'.
 * 	- If 'cursorKeys' contains a single key, the cursor will correspond to the value of that key from the last element
 * 		in 'data'.
 * 	- If 'cursorKeys' features multiple keys, the cursor will be an encoded string incorporating the values of these
 * 		keys from the last element in 'data'.
 *
 * @param currentPageData - A generic array of objects, each object expected to extend { id: string }.
 * @param cursorKeys - An optional array of keys that determine the formation of the cursor. By default, this uses
 * 	the 'id' property.
 *
 * @returns PaginationMeta - An object detailing two crucial properties required for effective pagination: total item
 * 	count and the cursor.
 */
export function getMetaForNextPage<T extends { id: string }>(
	currentPageData: T[],
	cursorKeys?: undefined,
): PaginationMeta
export function getMetaForNextPage<T extends Record<string, unknown>, K extends keyof T>(
	currentPageData: T[],
	cursorKeys: K[],
): PaginationMeta
export function getMetaForNextPage<T extends Record<string, unknown>, K extends keyof T>(
	currentPageData: T[],
	cursorKeys?: K[],
): PaginationMeta {
	if (cursorKeys !== undefined && cursorKeys.length === 0) {
		throw new Error('cursorKeys cannot be an empty array')
	}
	if (currentPageData.length === 0) {
		return { count: 0 }
	}

	const lastElement = currentPageData[currentPageData.length - 1]
	let cursor: string = ''
	if (!cursorKeys) {
		cursor = lastElement.id as string
	} else {
		cursor =
			cursorKeys.length === 1
				? (lastElement[cursorKeys[0]] as string)
				: encodeCursor(pick(lastElement, cursorKeys))
	}

	return {
		count: currentPageData.length,
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
