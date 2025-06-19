import { describe, expect, it } from 'vitest'
import { hasMessage } from './hasMessage.ts'

describe('hasMessage', () => {
  it('true for something with message', () => {
    const obj = {
      message: 'hello',
    }

    expect(hasMessage(obj)).toBe(true)
  })

  it('false for something without message', () => {
    const obj = {
      hello: 'world',
    }

    expect(hasMessage(obj)).toBe(false)
  })
})
