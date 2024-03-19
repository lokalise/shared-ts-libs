import { describe, expect, it, vi } from 'vitest'

import {
	createPageResponse,
	encodeCursor,
	getMetaForNextPage,
	getPaginatedEntries,
	OptionalPaginationParams,
} from '../src'

describe('paginationUtils', () => {
	describe('createPageResponse', () => {
		it('array is empty', () => {
			const mockedArray: Entity[] = []
			const result = createPageResponse(mockedArray, 2)
			expect(result).toEqual({
				data: [],
				meta: { count: 0, hasMore: false },
			})
		})

		describe('pageLimit', () => {
			const mockedArray = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]

			it('pageLimit is undefined', () => {
				const result = createPageResponse(mockedArray, undefined)
				expect(result).toEqual({
					data: mockedArray,
					meta: { count: 4, cursor: 'd', hasMore: undefined },
				})
			})

			it('pageLimit less than input array', () => {
				const result = createPageResponse(mockedArray, 2)
				expect(result).toEqual({
					data: [mockedArray[0], mockedArray[1]],
					meta: { count: 2, cursor: 'b', hasMore: true },
				})
			})

			it('pageLimit equal to input array', () => {
				const result = createPageResponse(mockedArray, 4)
				expect(result).toEqual({
					data: mockedArray,
					meta: { count: 4, cursor: 'd', hasMore: false },
				})
			})

			it('pageLimit greater than input array', () => {
				const result = createPageResponse(mockedArray, 6)
				expect(result).toEqual({
					data: mockedArray,
					meta: { count: 4, cursor: 'd', hasMore: false },
				})
			})
		})

		describe('cursor', () => {
			it('empty cursorKeys produce error', () => {
				expect(() => getMetaForNextPage([], [])).toThrowError('cursorKeys cannot be an empty array')
			})

			it('cursor using id as default', () => {
				const mockedArray = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
				const result = createPageResponse(mockedArray, 2)
				expect(result).toEqual({
					data: [mockedArray[0], mockedArray[1]],
					meta: { count: 2, cursor: 'b', hasMore: true },
				})
			})

			it('cursor using single prop', () => {
				// not using id as prop to test type checking
				const mockedArray = [
					{ extra: 'a', name: 'hello' },
					{ extra: 'b', name: 'world' },
				]
				const result = createPageResponse(mockedArray, 3, ['name'])
				expect(result).toEqual({
					data: mockedArray,
					meta: { count: 2, cursor: 'world', hasMore: false },
				})
			})

			it('cursor with multiple fields', () => {
				const mockedArray = [
					{
						id: '1',
						name: 'apple',
						description: 'red',
					},
					{
						id: '2',
						name: 'banana',
						description: 'yellow',
					},
					{
						id: '3',
						name: 'orange',
						description: 'orange',
					},
				]
				const result = createPageResponse(mockedArray, 3, ['id', 'name'])
				expect(result).toEqual({
					data: mockedArray,
					meta: {
						count: 3,
						cursor: encodeCursor({ id: '3', name: 'orange' }),
						hasMore: false,
					},
				})
			})
		})
	})

	describe('getPaginatedEntries', () => {
		it('should call api 2 times', async () => {
			const spy = vi
				.spyOn(market, 'getApples')
				.mockResolvedValueOnce({
					data: [{ id: 'red' }],
					meta: {
						count: 1,
						cursor: 'red',
					},
				})
				.mockResolvedValueOnce({
					data: [],
					meta: {
						count: 0,
					},
				})

			const result = await getPaginatedEntries({ limit: 1 }, (params) => {
				return market.getApples(params)
			})

			expect(spy).toHaveBeenCalledTimes(2)
			expect(result).toEqual([{ id: 'red' }])
		})
		it('should call api 1 time', async () => {
			const spy = vi.spyOn(market, 'getApples').mockResolvedValueOnce({
				data: [],
				meta: {
					count: 0,
				},
			})

			const result = await getPaginatedEntries({ limit: 1 }, (params) => {
				return market.getApples(params)
			})

			expect(spy).toHaveBeenCalledTimes(1)
			expect(result).toEqual([])
		})
		it('should call api 3 time', async () => {
			const spy = vi
				.spyOn(market, 'getApples')
				.mockResolvedValueOnce({
					data: [{ id: 'red' }],
					meta: {
						count: 1,
						cursor: 'red',
					},
				})
				.mockResolvedValueOnce({
					data: [{ id: 'blue' }],
					meta: {
						count: 1,
						cursor: 'blue',
					},
				})
				.mockResolvedValueOnce({
					data: [],
					meta: {
						count: 0,
					},
				})

			const result = await getPaginatedEntries({ limit: 1 }, (params) => {
				return market.getApples(params)
			})

			expect(spy).toHaveBeenCalledTimes(3)
			expect(result).toEqual([{ id: 'red' }, { id: 'blue' }])
		})
	})
})

type Entity = {
	id: string
}
type GetApplesResponse = {
	data: Entity[]
	meta: {
		count: number
		cursor?: string
	}
}
const market = {
	getApples: async (params: OptionalPaginationParams): Promise<GetApplesResponse> => {
		return Promise.resolve({
			data: [{ id: 'red' }],
			meta: {
				count: params.limit ?? 1,
				cursor: 'red',
			},
		})
	},
}
