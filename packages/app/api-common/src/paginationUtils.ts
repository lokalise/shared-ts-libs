import type { PaginationMeta, OptionalPaginationParams } from './apiSchemas'

type metaParams = {
	statusUrl?: string
	limit: number
	hasMore: boolean
}
export function getMetaFor<T extends { id: string }>(data: T[], params?: metaParams) {
	return {
		...(params && { statusUrl: params.statusUrl }),
		page: {
			...(params && params.limit !== undefined && { limit: params.limit }),
			...(params && params.hasMore !== undefined && { hasMore: params.hasMore }),
			endingBefore: data.length > 0 ? data[data.length - 1].id : undefined,
			startingAfter: data.length > 0 ? data[0].id : undefined,
			count: data.length,
		},
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
	let hasMore: boolean | undefined = undefined
	do {
		const pageResult = await apiCall({ ...pagination, after: currentCursor })
		resultArray.push(...pageResult.data)
		currentCursor = pageResult.meta.page?.startingAfter
		hasMore = pageResult.meta.page?.hasMore
	} while ((currentCursor && hasMore === undefined) || (currentCursor && hasMore))

	return resultArray
}
