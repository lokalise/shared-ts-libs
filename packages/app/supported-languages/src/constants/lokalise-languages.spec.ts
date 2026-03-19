import { describe, expect, it } from 'vitest'
import { languages } from './languages.ts'
import { lokaliseSupportedLanguagesAndLocales } from './lokalise-languages.ts'
import { standardLocales } from './standard-locales.ts'

describe('lokaliseSupportedLanguagesAndLocales', () => {
  it('is a subset of all languages and standard locales', () => {
    for (const entry of lokaliseSupportedLanguagesAndLocales) {
      const isLanguage = languages.has(entry)
      const isLocale = standardLocales.has(entry)
      expect(isLanguage || isLocale).toBe(true)
    }
  })
})
