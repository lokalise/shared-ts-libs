import { pick } from '@lokalise/node-core'

import type { PaginationMeta, OptionalPaginationParams } from './apiSchemas'
import { encodeCursor } from './cursorCoder'

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
	} else if (cursorKeys.length === 1) {
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
