import { describe, expect, it } from 'vitest'
import {
  getAllLanguages,
  getAllRegions,
  getAllScripts,
  getLokaliseSupportedLanguagesAndLocales,
  getStandardLocales,
} from './getters.ts'

describe('getAllLanguages', () => {
  it('returns a non-empty array', () => {
    expect(getAllLanguages().length).toBeGreaterThan(0)
  })

  it('should not repeat languages', () => {
    const languages = getAllLanguages()
    expect(languages.length).toBe([...new Set(languages)].length)
  })
})

describe('getAllRegions', () => {
  it('returns a non-empty array', () => {
    expect(getAllRegions().length).toBeGreaterThan(0)
  })

  it('should not repeat regions', () => {
    const regions = getAllRegions()
    expect(regions.length).toBe([...new Set(regions)].length)
  })
})

describe('getAllScripts', () => {
  it('returns a non-empty array', () => {
    expect(getAllScripts().length).toBeGreaterThan(0)
  })

  it('should not repeat scripts', () => {
    const scripts = getAllScripts()
    expect(scripts.length).toBe([...new Set(scripts)].length)
  })
})

describe('getStandardLocales', () => {
  it('returns a non-empty array', () => {
    expect(getStandardLocales().length).toBeGreaterThan(0)
  })

  it('should not repeat standard locales', () => {
    const locales = getStandardLocales()
    expect(locales.length).toBe([...new Set(locales)].length)
  })
})

describe('getLokaliseSupportedLanguagesAndLocales', () => {
  it('returns a non-empty array', () => {
    expect(getLokaliseSupportedLanguagesAndLocales().length).toBeGreaterThan(0)
  })

  it('should not repeat entries', () => {
    const locales = getLokaliseSupportedLanguagesAndLocales()
    expect(locales.length).toBe([...new Set(locales)].length)
  })

  it('is a subset of all languages and standard locales', () => {
    const languages = getAllLanguages() as unknown as string[]
    const standardLocales = getStandardLocales() as unknown as string[]

    for (const entry of getLokaliseSupportedLanguagesAndLocales()) {
      const isLanguage = languages.includes(entry as any)
      const isLocale = standardLocales.includes(entry as any)
      expect(isLanguage || isLocale).toBe(true)
    }
  })
})
