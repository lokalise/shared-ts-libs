import { describe, expect, it, vi } from 'vitest'

import {
	encodeCursor,
	getMetaForNextPage,
	getPaginatedEntries,
	OptionalPaginationParams,
} from '../src'

describe('paginationUtils', () => {
	describe('getMetaForNextPage', () => {
		it('array is empty', () => {
			const mockedArray: Entity[] = []
			const result = getMetaForNextPage(mockedArray)
			expect(result).toEqual({ count: 0 })
		})

		it('cursor using id as default', () => {
			const mockedArray = [{ id: 'a' }, { id: 'b' }]
			const result = getMetaForNextPage(mockedArray)
			expect(result).toEqual({ count: 2, cursor: 'b' })
		})

		it('empty cursorKeys produce error', () => {
			expect(() => getMetaForNextPage([], [])).toThrowError('cursorKeys cannot be an empty array')
		})

		it('cursor using single prop', () => {
			// not using id as prop to test type checking
			const mockedArray = [
				{ extra: 'a', name: 'hello' },
				{ extra: 'b', name: 'world' },
			]
			const result = getMetaForNextPage(mockedArray, ['name'])
			expect(result).toEqual({ count: 2, cursor: 'world' })
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
			const result = getMetaForNextPage(mockedArray, ['id', 'name'])
			expect(result).toEqual({
				count: 3,
				cursor: encodeCursor({ id: '3', name: 'orange' }),
			})
		})

		describe('expectedCount is provided', () => {
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

			it('expectedCount less than input array length produces truthy hasMore', () => {
				const result = getMetaForNextPage(mockedArray, ['id', 'name'], 2)
				expect(result).toEqual({
					count: 3,
					cursor: encodeCursor({ id: '3', name: 'orange' }),
					hasMore: true,
				})
			})

			it('expectedCount equal to input array length produces falsy hasMore', () => {
				const result = getMetaForNextPage(mockedArray, ['id', 'name'], 3)
				expect(result).toEqual({
					count: 3,
					cursor: encodeCursor({ id: '3', name: 'orange' }),
					hasMore: false,
				})
			})

			it('expectedCount greater than input array length produces falsy hasMore', () => {
				const result = getMetaForNextPage(mockedArray, ['id', 'name'], 4)
				expect(result).toEqual({
					count: 3,
					cursor: encodeCursor({ id: '3', name: 'orange' }),
					hasMore: false,
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
