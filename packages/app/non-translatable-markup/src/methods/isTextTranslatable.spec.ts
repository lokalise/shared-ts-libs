import { describe, expect, it } from 'vitest'
import { isTextTranslatable } from './isTextTranslatable'

describe('isTextTranslatable', () => {
  it('should return false on empty text', () => {
    expect(isTextTranslatable('')).toBe(false)
  })

  it('should return false on trimmed empty text', () => {
    expect(isTextTranslatable('    ')).toBe(false)
  })

  it.each([
    'Hello, World', // Without NT tags
    'Hello, \uE101World!\uE102', // Single region within NT tags
    'Hello, \uE101World!\uE102 How are you?', // Single region within NT tags in the middle
    'Hello, \uE101World!\uE102 How are you? \uE101I am fine!\uE102', // several regions within NT tags
    ' \uE101Hello world!\uE102 How are you? \uE101I am fine!\uE102 ', // several regions within NT tags with leading and trailing spaces
    //'1234',
    'Hello1, World2', // Contains text and numbers
    'Hello!<> world', // symbols mixed with text
    'Hello\uE101bold\uE102! 123\uE101bold\uE102 world', // numbers mixed with NT regions and symbols

    // translatable symbols (currency symbols atm)
    '€',
    '$',
    '£',
    '¥',
    '₽',
    '¢',

    // dates are translatable
    '2024-01-01',
    '2024/01/01',
    '2024.01.01',
    '24-01-01',
    '24/01/01',
    '24.01.01',
    '24-1-1',
    '24/1/1',
    '24.1.1',
    '01-01-2024',
    '01/01/2024',
    '01.01.2024',
    '01-01-24',
    '01/01/24',
    '01.01.24',
    '1-1-24',
    '1/1/24',
    '1.1.24',
  ])('should return true if text contains translatable content (test case: %s)', (testCase) => {
    expect(isTextTranslatable(testCase)).toBe(true)
  })

  it.each([
    '\uE101Hello world!\uE102', // all is between a single NT region
    ' \uE101Hello world!\uE102 \uE101How are you\uE102 ', // all is between several NT regions
    '123456', // only numbers
    '123\uE101hello\uE102 123', // numbers with translatable text
    '123! 4 | 56', // numbers with symbols
    '\uE101hello\uE102 123! \uE1012060\uE102 | 56', // numbers with symbols

    // bad formatted dates
    '2024/01.01',
    '01-01/24',
    '01-01-1',

    // Testing single symbols
    '¡',
    '!',
    '¿',
    '?',
    '@',
    '#',
    '^',
    '&',
    '*',
    '÷',
    '%',
    '>',
    '<',
    '≥',
    '≤',
    '+',
    '±',
    '=',
    '≈',
    '≠',
    '.',
    ',',
    '_',
    '∞',
    '\\',
    '-',
    '/',
    '|',
    '"',
    "'",
    '`',
    '´',
    ')',
    '(',
    ']',
    '[',
    '}',
    '{',
    '§',
    '†',
    '‡',
    '•',
    '°',
    '©',
    '®',
    '™',
    '←',
    '↑',
    '→',
    '↓',
    '√',
    '∑',
    '∫',
    '❤',
    '♂',
    '♀',
    '♂',

    // testing emojis
    '🥳',
    '😊',
    '🌟',
    '🚀',
    '🎉',
    '💯',
    '🔥',
    '🚴',
    '🤹',
    '🎭',
    '🎨',
    '🎸',
    '🎺',
    '🎻',
    '🥁',
  ])(
    'should return false if text contains only non-translatable content (test case: %s)',
    (testCase) => {
      expect(isTextTranslatable(testCase)).toBe(false)
    },
  )
})
