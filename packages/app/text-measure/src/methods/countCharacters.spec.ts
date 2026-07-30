import {
  NON_TRANSLATABLE_END_TAG,
  NON_TRANSLATABLE_START_TAG,
} from '@lokalise/non-translatable-markup'
import { countCharacters } from './countCharacters.ts'

describe('countCharacters', () => {
  it('defaults to utf16', () => {
    const text = '👨‍👩‍👧' //counts differently under every algorithm
    const defaultAlgResult = countCharacters(text)

    expect(countCharacters(text, { algorithm: 'utf16' })).toBe(defaultAlgResult)
    expect(countCharacters(text, { algorithm: 'codePoints' })).not.toBe(defaultAlgResult)
  })

  // Simple strings and NTC handling — algorithm-agnostic (same result for every algorithm).
  it.each([
    { name: 'plain text', text: 'Hello', expected: 5 },
    { name: 'whitespace is counted', text: 'Hello world', expected: 11 },
    { name: 'newlines and tabs are counted', text: 'a\n\tb', expected: 4 },
    { name: 'empty string', text: '', expected: 0 },
    { name: 'non-ASCII BMP character', text: '€', expected: 1 },
    {
      name: 'NTC markers are excluded but the content they wrap is kept',
      text: `a${NON_TRANSLATABLE_START_TAG}bc${NON_TRANSLATABLE_END_TAG}d`,
      expected: 4,
    },
    {
      name: 'text consisting only of an NTC region keeps its content',
      text: `${NON_TRANSLATABLE_START_TAG}abc${NON_TRANSLATABLE_END_TAG}`,
      expected: 3,
    },
    {
      name: 'multiple NTC regions, content kept',
      text: `${NON_TRANSLATABLE_START_TAG}a${NON_TRANSLATABLE_END_TAG}x${NON_TRANSLATABLE_START_TAG}b${NON_TRANSLATABLE_END_TAG}`,
      expected: 3,
    },
  ])('counts simple strings and NTC ($name)', ({ text, expected }) => {
    expect(countCharacters(text)).toBe(expected)
  })

  describe('algorithm', () => {
    it.each([
      { name: 'emoji', text: '👍', expected: 2 },
      { name: 'emoji within text', text: 'a👍b', expected: 4 },
      { name: 'family emoji (ZWJ emoji sequence)', text: '👨‍👩‍👧', expected: 8 },
    ])('utf16 counts surrogate pairs as two ($name)', ({ text, expected }) => {
      expect(countCharacters(text, { algorithm: 'utf16' })).toBe(expected)
    })

    it.each([
      { name: 'emoji', text: '👍', expected: 1 },
      { name: 'emoji within text', text: 'a👍b', expected: 3 },
      { name: 'family emoji (ZWJ emoji sequence)', text: '👨‍👩‍👧', expected: 5 },
    ])('codePoints counts surrogate pairs as one ($name)', ({ text, expected }) => {
      expect(countCharacters(text, { algorithm: 'codePoints' })).toBe(expected)
    })
  })
})
