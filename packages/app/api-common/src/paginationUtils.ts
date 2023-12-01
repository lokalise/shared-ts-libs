import type { PaginationMeta, OptionalPaginationParams } from './apiSchemas'

export function getMetaFor<T extends { id: string }>(data: T[]) {
	return {
		count: data.length,
		cursor: data.length > 0 ? data[data.length - 1].id : undefined,
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
