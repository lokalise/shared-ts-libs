import { pick } from '@lokalise/node-core'

import type { PaginationMeta, OptionalPaginationParams } from './apiSchemas'

export function getMetaFor<T extends { id: string }, K extends Exclude<keyof T, 'id'>>(
	data: T[],
	cursorKeys?: K[],
): PaginationMeta {
	if (data.length === 0) {
		return { count: 0 }
	}

	return {
		count: data.length,
		cursor:
			cursorKeys && cursorKeys.length > 0
				? JSON.stringify(pick(data[data.length - 1], ['id', ...cursorKeys]))
				: data[data.length - 1].id,
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
