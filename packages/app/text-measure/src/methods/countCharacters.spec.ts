import {
  NON_TRANSLATABLE_END_TAG,
  NON_TRANSLATABLE_START_TAG,
} from '@lokalise/non-translatable-markup'
import { countCharacters } from './countCharacters.ts'

describe('countCharacters', () => {
  it('defaults to codePoints', () => {
    expect(countCharacters('Hello 𐐷')).toBe(countCharacters('Hello 𐐷', { algorithm: 'codePoints' }))
  })

  it.each([
    { name: 'plain text', text: 'Hello', expected: 5 },
    { name: 'whitespace is counted', text: 'Hello world', expected: 11 },
    { name: 'empty string', text: '', expected: 0 },
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
    { name: 'astral characters count as a single code point', text: '𐐷', expected: 1 },
    { name: 'astral characters within surrounding text', text: 'a𐐷b', expected: 3 },
    { name: 'emoji counts as its code points', text: '👍', expected: 1 },
    { name: 'newlines and tabs are counted', text: 'a\n\tb', expected: 4 },
  ])('counts characters with codePoints algorithm ($name)', ({ text, expected }) => {
    expect(countCharacters(text, { algorithm: 'codePoints' })).toBe(expected)
  })
})
