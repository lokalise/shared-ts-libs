import { describe, expect, it } from 'vitest'
import { isTextTranslatable } from './isTextTranslatable'

describe('isTextTranslatable', () => {
  it('should return false on empty text', () => {
    expect(isTextTranslatable('')).toBe(false)
  })

  it('should return false on trimmed empty text', () => {
    expect(isTextTranslatable('    ')).toBe(false)
  })

  it('should return true if text contains translatable content', () => {
    const testCases = [
      'Hello',
      'Hello, World!',
      'Hello, \uE101World!\uE102',
      'Hello, \uE101World!\uE102 How are you?',
      'Hello, \uE101World!\uE102 How are you? \uE101I am fine!\uE102',
      ' \uE101Hello world!\uE102 How are you? \uE101I am fine!\uE102 ',
    ]

    for (const testCase of testCases) {
      expect(isTextTranslatable(testCase)).toBe(true)
    }
  })

  it('should return false if text contains only non-translatable content', () => {
    const testCases = [
      '\uE101Hello world!\uE102',
      ' \uE101Hello world!\uE102 \uE101How are you\uE102 ',
    ]

    for (const testCase of testCases) {
      expect(isTextTranslatable(testCase)).toBe(false)
    }
  })
})
