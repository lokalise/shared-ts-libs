import { describe, expect, it } from 'vitest'
import {
  getLocaleDirection,
  isStandardLocale,
  isSupportedLocale,
  normalizeLocale,
  parseLocale,
  stringifyLocale,
} from './locale.ts'

describe('isSupportedLocale', () => {
  it('returns true for valid language codes', () => {
    expect(isSupportedLocale('en')).toBe(true)
    expect(isSupportedLocale('my')).toBe(true) // Burmese
  })

  it('returns true for valid language-region locales', () => {
    expect(isSupportedLocale('en-US')).toBe(true)
    expect(isSupportedLocale('en-RU')).toBe(true)
    expect(isSupportedLocale('en-001')).toBe(true) // 001 is a valid region
  })

  it('returns true for valid language-script-region locales', () => {
    expect(isSupportedLocale('en-Latn-US')).toBe(true)
    expect(isSupportedLocale('sr-Cyrl-CS')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isSupportedLocale('en-us')).toBe(true)
  })

  it('returns false for an unknown language', () => {
    expect(isSupportedLocale('abc')).toBe(false)
    expect(isSupportedLocale('abc-US')).toBe(false)
  })

  it('returns false for an unknown region', () => {
    expect(isSupportedLocale('en-AB')).toBe(false)
  })

  it('returns false for an unknown script', () => {
    expect(isSupportedLocale('en-Abcd-US')).toBe(false)
  })
})

describe('isStandardLocale', () => {
  it('returns true for standard locales', () => {
    expect(isStandardLocale('en-US')).toBe(true)
    expect(isStandardLocale('fr-CA')).toBe(true)
    expect(isStandardLocale('bs-Latn-BA')).toBe(true)
  })

  it('returns false for language-only codes', () => {
    expect(isStandardLocale('en')).toBe(false)
  })

  it('returns false for non-standard locale combinations', () => {
    expect(isStandardLocale('en-DA')).toBe(false)
    expect(isStandardLocale('foo')).toBe(false)
  })
})

describe('stringifyLocale', () => {
  it('stringifies language only', () => {
    expect(stringifyLocale({ language: 'en' })).toBe('en')
  })

  it('stringifies language and script', () => {
    expect(stringifyLocale({ language: 'en', script: 'Latn' })).toBe('en-Latn')
  })

  it('stringifies language and region', () => {
    expect(stringifyLocale({ language: 'en', region: 'US' })).toBe('en-US')
  })

  it('stringifies language, script and region', () => {
    expect(stringifyLocale({ language: 'en', script: 'Latn', region: 'US' })).toBe('en-Latn-US')
  })
})

describe('parseLocale', () => {
  it('parses language only', () => {
    const { language, script, region } = parseLocale('en').result!
    expect(language).toBe('en')
    expect(script).toBeUndefined()
    expect(region).toBeUndefined()
  })

  it('parses language and script', () => {
    const { language, script, region } = parseLocale('en-Latn').result!
    expect(language).toBe('en')
    expect(script).toBe('Latn')
    expect(region).toBeUndefined()
  })

  it('parses language and region', () => {
    const { language, script, region } = parseLocale('en-US').result!
    expect(language).toBe('en')
    expect(script).toBeUndefined()
    expect(region).toBe('US')
  })

  it('parses language, script and region', () => {
    const { language, script, region } = parseLocale('en-Latn-US').result!
    expect(language).toBe('en')
    expect(script).toBe('Latn')
    expect(region).toBe('US')
  })

  it('ignores additional subtags', () => {
    const { language, script, region } = parseLocale('en-US-u-ca-gregory').result!
    expect(language).toBe('en')
    expect(script).toBeUndefined()
    expect(region).toBe('US')
  })

  it('returns error for an unsupported locale', () => {
    expect(parseLocale('abc-AB').error).toBe('Locale tag abc-AB is not supported')
  })
})

describe('getLocaleDirection', () => {
  it('returns ltr for LTR languages', () => {
    expect(getLocaleDirection('en')).toBe('ltr')
    expect(getLocaleDirection('fr')).toBe('ltr')
    expect(getLocaleDirection('zh')).toBe('ltr')
  })

  it('returns rtl for RTL languages', () => {
    expect(getLocaleDirection('ar')).toBe('rtl')
    expect(getLocaleDirection('he')).toBe('rtl')
    expect(getLocaleDirection('fa')).toBe('rtl')
    expect(getLocaleDirection('ur')).toBe('rtl')
  })

  it('works with language-region locales', () => {
    expect(getLocaleDirection('ar-SA')).toBe('rtl')
    expect(getLocaleDirection('en-US')).toBe('ltr')
  })

  it('returns null for invalid tags', () => {
    expect(getLocaleDirection('not-a-valid-!!!-locale')).toBeNull()
  })
})

describe('normalizeLocale', () => {
  it('returns null for "und"', () => {
    expect(normalizeLocale('und')).toBeNull()
  })

  it('returns null for invalid locale', () => {
    expect(normalizeLocale('not a locale')).toBeNull()
  })

  it('normalizes language only', () => {
    expect(normalizeLocale('en')).toBe('en')
  })

  it('normalizes language and script', () => {
    expect(normalizeLocale('en-Latn')).toBe('en-Latn')
  })

  it('normalizes language and region', () => {
    expect(normalizeLocale('en-US')).toBe('en-US')
    expect(normalizeLocale('en-001')).toBe('en-001')
  })

  it('normalizes language, script and region', () => {
    expect(normalizeLocale('en-Latn-US')).toBe('en-Latn-US')
    expect(normalizeLocale('sr-Cyrl-CS')).toBe('sr-Cyrl-RS') // CS → RS via Intl.Locale
  })

  it('strips invalid subtags', () => {
    expect(normalizeLocale('en-1234')).toBe('en')
    expect(normalizeLocale('in-FRENCH')).toBe('id') // 'in' → 'id' (Indonesian)
    expect(normalizeLocale('zh-CN-script')).toBe('zh-CN')
  })

  it('returns the tag as-is for structurally valid but unknown values', () => {
    expect(normalizeLocale('hello')).toBe('hello')
  })
})
