import { describe, expect, it, vi } from 'vitest'
import type { OptionalPaginationParams } from './apiSchemas.ts'
import { encodeCursor } from './cursorCodec.ts'
import { createPaginatedResponse, getPaginatedEntriesByHasMore } from './paginationUtils.ts'

describe('paginationUtils', () => {
  describe('createPaginatedResponse', () => {
    it('array is empty', () => {
      const mockedArray: Entity[] = []
      const result = createPaginatedResponse(mockedArray, 2)
      expect(result).toEqual({
        data: [],
        meta: { count: 0, hasMore: false },
      })
    })

    describe('pageLimit', () => {
      const mockedArray = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]

      it('pageLimit less than input array', () => {
        const result = createPaginatedResponse(mockedArray, 2)
        expect(result).toEqual({
          data: [mockedArray[0], mockedArray[1]],
          meta: { count: 2, cursor: 'b', hasMore: true },
        })
      })

      it('pageLimit equal to input array', () => {
        const result = createPaginatedResponse(mockedArray, 4)
        expect(result).toEqual({
          data: mockedArray,
          meta: { count: 4, cursor: 'd', hasMore: false },
        })
      })

      it('pageLimit greater than input array', () => {
        const result = createPaginatedResponse(mockedArray, 6)
        expect(result).toEqual({
          data: mockedArray,
          meta: { count: 4, cursor: 'd', hasMore: false },
        })
      })
    })

    describe('cursor', () => {
      it('empty cursorKeys produce error', () => {
        const mockedArray = [{ id: 'a' }]
        expect(() => createPaginatedResponse(mockedArray, 1, [])).toThrowError(
          'cursorKeys cannot be an empty array',
        )
      })

      it('cursor using id as default', () => {
        const mockedArray = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
        const result = createPaginatedResponse(mockedArray, 2)
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
        const result = createPaginatedResponse(mockedArray, 3, ['name'])
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
        const result = createPaginatedResponse(mockedArray, 3, ['id', 'name'])
        expect(result).toEqual({
          data: mockedArray,
          meta: {
            count: 3,
            cursor: encodeCursor({ id: '3', name: 'orange' }),
            hasMore: false,
          },
        })
      })

      it('cursor using single number prop is converted to string without encoding', () => {
        const mockedArray = [
          { id: '1', sequenceNumber: 100 },
          { id: '2', sequenceNumber: 200 },
          { id: '3', sequenceNumber: 300 },
        ]
        const result = createPaginatedResponse(mockedArray, 3, ['sequenceNumber'])
        expect(result).toEqual({
          data: mockedArray,
          meta: {
            count: 3,
            cursor: '300', // Number converted to string, not encoded
            hasMore: false,
          },
        })
      })
    })
  })

  describe('getPaginatedEntriesByHasMore', () => {
    it('should call api 1 time and return value', async () => {
      const spy = vi.spyOn(market, 'getApples').mockResolvedValueOnce({
        data: [{ id: 'red' }],
        meta: {
          count: 1,
          cursor: 'red',
          hasMore: false,
        },
      })

      const result = await getPaginatedEntriesByHasMore({ limit: 1 }, (params) => {
        return market.getApples(params)
      })

      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0]![0]).toStrictEqual({ limit: 1 })
      expect(result).toEqual([{ id: 'red' }])
    })
    it('should call api 1 time', async () => {
      const spy = vi.spyOn(market, 'getApples').mockResolvedValueOnce({
        data: [],
        meta: {
          count: 0,
          hasMore: false,
        },
      })

      const result = await getPaginatedEntriesByHasMore({ limit: 1 }, (params) => {
        return market.getApples(params)
      })

      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0]![0]).toStrictEqual({ limit: 1 })
      expect(result).toEqual([])
    })
    it('should call api 2 time', async () => {
      const spy = vi
        .spyOn(market, 'getApples')
        .mockResolvedValueOnce({
          data: [{ id: 'red' }],
          meta: {
            count: 1,
            cursor: 'red',
            hasMore: true,
          },
        })
        .mockResolvedValueOnce({
          data: [{ id: 'blue' }],
          meta: {
            count: 1,
            cursor: 'blue',
            hasMore: false,
          },
        })

      const result = await getPaginatedEntriesByHasMore({ limit: 1 }, (params) => {
        return market.getApples(params)
      })

      expect(spy).toHaveBeenCalledTimes(2)
      expect(spy.mock.calls[0]![0]).toStrictEqual({ limit: 1 })
      expect(spy.mock.calls[1]![0]).toStrictEqual({ limit: 1, after: 'red' })
      expect(result).toEqual([{ id: 'red' }, { id: 'blue' }])
    })

    it('should respect initial cursor', async () => {
      const spy = vi.spyOn(market, 'getApples').mockResolvedValueOnce({
        data: [{ id: 'red' }],
        meta: {
          count: 1,
          cursor: 'red',
          hasMore: false,
        },
      })

      const result = await getPaginatedEntriesByHasMore({ limit: 1, after: 'red' }, (params) => {
        return market.getApples(params)
      })

      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0]![0]).toStrictEqual({ limit: 1, after: 'red' })
      expect(result).toEqual([{ id: 'red' }])
    })

    it('should skip undefined even if provided explicitly', async () => {
      const spy = vi.spyOn(market, 'getApples').mockResolvedValueOnce({
        data: [{ id: 'red' }],
        meta: {
          count: 1,
          cursor: 'red',
          hasMore: false,
        },
      })

      const undefinedCursorResult = await getPaginatedEntriesByHasMore(
        { limit: 1, after: undefined },
        (params) => {
          return market.getApples(params)
        },
      )

      const undefinedLimitResult = await getPaginatedEntriesByHasMore(
        { limit: undefined },
        (params) => {
          return market.getApples(params)
        },
      )

      expect(spy).toHaveBeenCalledTimes(2)
      expect(spy.mock.calls[0]![0]).toStrictEqual({ limit: 1 })
      expect(spy.mock.calls[1]![0]).toStrictEqual({})
      expect(undefinedCursorResult).toEqual([{ id: 'red' }])
      expect(undefinedLimitResult).toEqual([{ id: 'red' }])
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
    hasMore: boolean
  }
}
const market = {
  getApples: (params: OptionalPaginationParams): Promise<GetApplesResponse> => {
    return Promise.resolve({
      data: [{ id: 'red' }],
      meta: {
        count: params.limit ?? 1,
        cursor: 'red',
        hasMore: false,
      },
    })
  },
}
