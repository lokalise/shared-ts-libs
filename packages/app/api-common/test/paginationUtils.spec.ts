import { describe, it, expect, vi } from 'vitest'

import { OptionalPaginationParams, getMetaFor, getPaginatedEntries } from '../src'
import { encodeCursor } from '../src/cursorCoder'

describe('paginationUtils', () => {
	describe('getMetaFor', () => {
		it('cursor is undefined', () => {
			const mockedArray: Entity[] = []
			const result = getMetaFor(mockedArray)
			expect(result).toEqual({ count: 0 })
		})

		it('cursor is defined using id as default', () => {
			const mockedArray = [{ id: 'a' }, { id: 'b' }]
			const result = getMetaFor(mockedArray)
			expect(result).toEqual({ count: 2, cursor: 'b' })
		})

		it('cursor is defined using specified prop', () => {
			const mockedArray = [
				{ id: 'a', name: 'hello' },
				{ id: 'b', name: 'world' },
			]
			const result = getMetaFor(mockedArray, ['name'])
			expect(result).toEqual({ count: 2, cursor: 'world' })
		})

		it('cursor has multiple fields', () => {
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
			const result = getMetaFor(mockedArray, ['id', 'name'])
			expect(result).toEqual({
				count: 3,
				cursor: encodeCursor({ id: '3', name: 'orange' }),
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
