import type { PaginationMeta, PaginationParams } from './apiSchemas'

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
	pagination: PaginationParams,
	apiCall: (params: PaginationParams) => Promise<PaginatedResponse<T>>,
): Promise<T[]> {
	const resultArray: T[] = []
	const result = await apiCall(pagination)
	resultArray.push(...result.data)
	let currentCursor = result.meta.cursor
	while (currentCursor) {
		const pageResult = await apiCall({ ...pagination, after: currentCursor })
		resultArray.push(...pageResult.data)
		currentCursor = pageResult.meta.cursor
	}

	return resultArray
}
