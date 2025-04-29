import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest'
import { callChunked } from './callChunked.ts'

describe('callChunked', () => {
  let mockedMethod: Mock

  beforeEach(() => {
    mockedMethod = vi.fn()
  })

  it('empty array', async () => {
    const array: string[] = []
    await callChunked(2, array, mockedMethod)
    expect(mockedMethod).not.toHaveBeenCalled()
  })

  it('should call function with chunked array', async () => {
    const array = [1, 2, 3, 4, 5]

    expect.assertions(3)
    mockedMethod.mockReturnValueOnce([1, 2]).mockReturnValueOnce([3, 4]).mockReturnValue([5])

    await callChunked(2, array, async (arrayChunk) => {
      expect(arrayChunk).toStrictEqual(await mockedMethod())
    })
  })
})
