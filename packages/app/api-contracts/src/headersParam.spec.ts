import { describe, expect, it } from 'vitest'
import { resolveHeadersParam } from './headersParam.ts'

describe('resolveHeadersParam', () => {
  it('passes a plain object through untouched', () => {
    const headers = { authorization: 'Bearer a' }

    expect(resolveHeadersParam(headers)).toBe(headers)
  })

  it('invokes a sync factory', () => {
    expect(resolveHeadersParam(() => ({ authorization: 'Bearer b' }))).toEqual({
      authorization: 'Bearer b',
    })
  })

  it('invokes an async factory and returns its promise', async () => {
    await expect(
      resolveHeadersParam(() => Promise.resolve({ authorization: 'Bearer c' })),
    ).resolves.toEqual({ authorization: 'Bearer c' })
  })

  it('passes undefined through for an optional header param', () => {
    expect(resolveHeadersParam<Record<string, string> | undefined>(undefined)).toBeUndefined()
  })
})
