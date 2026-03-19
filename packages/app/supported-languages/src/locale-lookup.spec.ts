import { describe, expect, it } from 'vitest'
import { getCommonLanguagesForRegion, getCommonRegionsForLanguage } from './locale-lookup.ts'

describe('getCommonRegionsForLanguage', () => {
  it('returns regions for a language present in standard locales', () => {
    expect(getCommonRegionsForLanguage('zh')).toMatchObject(['CN', 'HK', 'MO', 'SG', 'TW'])
    expect(getCommonRegionsForLanguage('en')).toContain('US')
    expect(getCommonRegionsForLanguage('en')).toContain('GB')
  })

  it('returns empty array for a language not present in standard locales', () => {
    expect(getCommonRegionsForLanguage('ace')).toEqual([])
  })

  it('returns empty array for an unknown language', () => {
    expect(getCommonRegionsForLanguage('abc')).toEqual([])
  })
})

describe('getCommonLanguagesForRegion', () => {
  it('returns languages for a region present in standard locales', () => {
    expect(getCommonLanguagesForRegion('CA')).toMatchObject(['en', 'fr', 'iu'])
    expect(getCommonLanguagesForRegion('CH')).toContain('de')
    expect(getCommonLanguagesForRegion('CH')).toContain('fr')
  })

  it('returns empty array for a region not present in standard locales', () => {
    expect(getCommonLanguagesForRegion('AC')).toEqual([])
  })

  it('returns empty array for an unknown region', () => {
    expect(getCommonLanguagesForRegion('AB')).toEqual([])
  })
})
