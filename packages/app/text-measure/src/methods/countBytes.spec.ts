import {
  NON_TRANSLATABLE_END_TAG,
  NON_TRANSLATABLE_START_TAG,
} from '@lokalise/non-translatable-markup'
import { countBytes } from './countBytes.ts'

describe('countBytes', () => {
  it.each([
    { name: 'empty string', text: '', expected: 0 },
    { name: 'ASCII', text: 'Hello world', expected: 11 },
    { name: 'newlines and tabs', text: 'a\n\tb', expected: 4 },
    { name: 'two-byte characters (accents, cyrillic)', text: 'éд', expected: 4 },
    { name: 'three-byte characters (CJK, €)', text: '你好€', expected: 9 },
    { name: 'four-byte characters (emoji)', text: '👍', expected: 4 },
    { name: 'emoji with skin tone modifier', text: '👍🏽', expected: 8 },
    {
      name: 'NTC markers and their content are counted',
      text: `a${NON_TRANSLATABLE_START_TAG}<b>${NON_TRANSLATABLE_END_TAG}`,
      expected: 1 + 3 + 3 + 3,
    },
    { name: 'lone high surrogate', text: 'a\uD83D', expected: 4 },
    { name: 'lone low surrogate', text: '\uDC4Da', expected: 4 },
    { name: 'reversed surrogate pair', text: '\uDC4D\uD83D', expected: 6 },
  ])('counts $name', ({ text, expected }) => {
    expect(countBytes(text)).toBe(expected)
  })

  it('defaults to utf8', () => {
    const text = '你好 👍'

    expect(countBytes(text)).toBe(11)
    expect(countBytes(text, { encoding: 'utf8' })).toBe(11)
  })
})
