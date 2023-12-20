import { OptionalPaginationParams } from '../src'
import { getMetaFor, getPaginatedEntries } from '../src/paginationUtils'

describe('paginationUtils', () => {
	describe('getMetaFor', () => {
		it('starting position is defined', () => {
			const mockedArray = [{ id: 'a' }, { id: 'b' }]
			getMetaFor(mockedArray)

			expect(getMetaFor(mockedArray)).toEqual({
				page: {
					count: 2,
					startingAfter: 'a',
					endingBefore: 'b',
				},
			})
		})

		it('starting position is undefined', () => {
			const mockedArray: Entity[] = []
			getMetaFor(mockedArray)

			expect(getMetaFor(mockedArray)).toEqual({
				page: {
					count: 0,
					endingBefore: undefined,
					startingAfter: undefined,
				},
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
						page: {
							count: 1,
							startingBefore: undefined,
							startingAfter: 'red',
						},
					},
				})
				.mockResolvedValueOnce({
					data: [],
					meta: {
						page: {
							count: 0,
							startingBefore: undefined,
							startingAfter: undefined,
						},
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
					page: {
						count: 0,
					},
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
						page: {
							count: 1,
							startingAfter: 'red',
						},
					},
				})
				.mockResolvedValueOnce({
					data: [{ id: 'blue' }],
					meta: {
						page: {
							count: 1,
							startingAfter: 'blue',
						},
					},
				})
				.mockResolvedValueOnce({
					data: [],
					meta: {
						page: {
							count: 0,
						},
					},
				})

			const result = await getPaginatedEntries({ limit: 1 }, (params) => {
				return market.getApples(params)
			})

			expect(spy).toHaveBeenCalledTimes(3)
			expect(result).toEqual([{ id: 'red' }, { id: 'blue' }])
		})

		it('should call api 2 times when having a cursor but hasMore set to false', async () => {
			const spy = vi
				.spyOn(market, 'getApples')
				.mockResolvedValueOnce({
					data: [{ id: 'red' }],
					meta: {
						page: {
							count: 1,
							startingAfter: 'red',
							hasMore: true,
						},
					},
				})
				.mockResolvedValueOnce({
					data: [{ id: 'blue' }],
					meta: {
						page: {
							count: 1,
							startingAfter: 'blue',
							hasMore: false,
						},
					},
				})

			const result = await getPaginatedEntries({ limit: 1 }, (params) => {
				return market.getApples(params)
			})

			expect(spy).toHaveBeenCalledTimes(2)
			expect(result).toEqual([{ id: 'red' }, { id: 'blue' }])
		})
	})
})

const market = {
	getApples: async (params: OptionalPaginationParams) => {
		return Promise.resolve({
			data: [{ id: 'red' }],
			meta: {
				count: params.limit ?? 1,
				cursor: 'red',
			},
		})
	},
}

type Entity = {
	id: string
}
