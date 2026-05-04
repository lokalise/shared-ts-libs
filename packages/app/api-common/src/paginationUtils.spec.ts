import { describe, expect, it, vi } from 'vitest'
import type { OptionalPaginationParams } from './apiSchemas.ts'
import { encodeCursor } from './cursorCodec.ts'
import { createPaginatedResponse, getPaginatedEntries } from './paginationUtils.ts'

describe('paginationUtils', () => {
  describe('createPaginatedResponse', () => {
    it('array is empty', () => {
      const mockedArray: Entity[] = []
      const result = createPaginatedResponse(mockedArray, 2)
      expect(result).toEqual({
        data: [],
        meta: { resultCount: 0, hasMore: false },
      })
    })

    describe('pageLimit', () => {
      const mockedArray = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]

      it('pageLimit less than input array', () => {
        const result = createPaginatedResponse(mockedArray, 2)
        expect(result).toEqual({
          data: [mockedArray[0], mockedArray[1]],
          meta: { resultCount: 2, cursor: 'b', hasMore: true },
        })
      })

      it('pageLimit equal to input array', () => {
        const result = createPaginatedResponse(mockedArray, 4)
        expect(result).toEqual({
          data: mockedArray,
          meta: { resultCount: 4, cursor: 'd', hasMore: false },
        })
      })

      it('pageLimit greater than input array', () => {
        const result = createPaginatedResponse(mockedArray, 6)
        expect(result).toEqual({
          data: mockedArray,
          meta: { resultCount: 4, cursor: 'd', hasMore: false },
        })
      })
    })

    describe('cursor', () => {
      describe('undefined (default id)', () => {
        it('uses id of the last element within the page limit', () => {
          const mockedArray = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
          const result = createPaginatedResponse(mockedArray, 2)
          expect(result).toEqual({
            data: [mockedArray[0], mockedArray[1]],
            meta: { resultCount: 2, cursor: 'b', hasMore: true },
          })
        })
      })

      describe('cursorKeys', () => {
        it('empty array produces error', () => {
          const mockedArray: Entity[] = []
          expect(() => createPaginatedResponse(mockedArray, 2, [])).toThrowError(
            'cursorKeys cannot be an empty array',
          )
        })

        it('single key uses raw value of that key', () => {
          // not using id as prop to test type checking
          const mockedArray = [
            { extra: 'a', name: 'hello' },
            { extra: 'b', name: 'world' },
          ]
          const result = createPaginatedResponse(mockedArray, 3, ['name'])
          expect(result).toEqual({
            data: mockedArray,
            meta: { resultCount: 2, cursor: 'world', hasMore: false },
          })
        })

        it('multiple keys produce an encoded cursor', () => {
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
              resultCount: 3,
              cursor: encodeCursor({ id: '3', name: 'orange' }),
              hasMore: false,
            },
          })
        })
      })

      describe('builder', () => {
        const nestedArray = [
          { id: '1', author: { name: 'alice', age: 30 } },
          { id: '2', author: { name: 'bob', age: 40 } },
          { id: '3', author: { name: 'carol', age: 50 } },
        ]

        it('returning a string is used as raw cursor', () => {
          const result = createPaginatedResponse(nestedArray, 2, (item) => item.author.name)
          expect(result).toEqual({
            data: [nestedArray[0], nestedArray[1]],
            meta: { resultCount: 2, cursor: 'bob', hasMore: true },
          })
        })

        it('returning an object is encoded', () => {
          const result = createPaginatedResponse(nestedArray, 3, (item) => ({
            id: item.id,
            authorName: item.author.name,
          }))
          expect(result).toEqual({
            data: nestedArray,
            meta: {
              resultCount: 3,
              cursor: encodeCursor({ id: '3', authorName: 'carol' }),
              hasMore: false,
            },
          })
        })

        it('is not invoked when page is empty', () => {
          const builder = vi.fn(() => 'never')
          const result = createPaginatedResponse([] as { id: string }[], 2, builder)
          expect(builder).not.toHaveBeenCalled()
          expect(result).toEqual({
            data: [],
            meta: { resultCount: 0, hasMore: false },
          })
        })

        it('receives last element within page limit, not the overflow item', () => {
          const builder = vi.fn((item: (typeof nestedArray)[number]) => item.author.name)
          createPaginatedResponse(nestedArray, 2, builder)
          expect(builder).toHaveBeenCalledTimes(1)
          expect(builder).toHaveBeenCalledWith(nestedArray[1])
        })
      })
    })
  })

  describe('getPaginatedEntries', () => {
    it('should call api 1 time and return value', async () => {
      const spy = vi.spyOn(market, 'getApples').mockResolvedValueOnce({
        data: [{ id: 'red' }],
        meta: {
          resultCount: 1,
          cursor: 'red',
          hasMore: false,
        },
      })

      const result = await getPaginatedEntries({ limit: 1 }, (params) => {
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
          resultCount: 0,
          hasMore: false,
        },
      })

      const result = await getPaginatedEntries({ limit: 1 }, (params) => {
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
            resultCount: 1,
            cursor: 'red',
            hasMore: true,
          },
        })
        .mockResolvedValueOnce({
          data: [{ id: 'blue' }],
          meta: {
            resultCount: 1,
            cursor: 'blue',
            hasMore: false,
          },
        })

      const result = await getPaginatedEntries({ limit: 1 }, (params) => {
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
          resultCount: 1,
          cursor: 'red',
          hasMore: false,
        },
      })

      const result = await getPaginatedEntries({ limit: 1, after: 'red' }, (params) => {
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
          resultCount: 1,
          cursor: 'red',
          hasMore: false,
        },
      })

      const undefinedCursorResult = await getPaginatedEntries(
        { limit: 1, after: undefined },
        (params) => {
          return market.getApples(params)
        },
      )

      const undefinedLimitResult = await getPaginatedEntries({ limit: undefined }, (params) => {
        return market.getApples(params)
      })

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
    resultCount: number
    cursor?: string
    hasMore: boolean
  }
}
const market = {
  getApples: (params: OptionalPaginationParams): Promise<GetApplesResponse> => {
    return Promise.resolve({
      data: [{ id: 'red' }],
      meta: {
        resultCount: params.limit ?? 1,
        cursor: 'red',
        hasMore: false,
      },
    })
  },
}
