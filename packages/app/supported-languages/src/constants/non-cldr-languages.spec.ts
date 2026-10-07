import { describe, expect, it } from 'vitest'
import { languages } from './languages.ts'
import { lokaliseSupportedLanguagesAndLocales } from './lokalise-languages.ts'
import { nonCldrLanguages } from './non-cldr-languages.ts'
import { rtlLanguages } from './rtl-languages.ts'

const rtlScripts = new Set(['Arab', 'Hebr', 'Nkoo', 'Syrc', 'Thaa'])

describe('nonCldrLanguages', () => {
  it('does not overlap with CLDR languages', () => {
    for (const language of nonCldrLanguages.keys()) {
      expect(languages.has(language)).toBe(false)
    }
  })

  it('is not part of Lokalise supported languages and locales', () => {
    for (const entry of lokaliseSupportedLanguagesAndLocales) {
      expect(nonCldrLanguages.has(new Intl.Locale(entry).language)).toBe(false)
    }
  })

  it.each([...nonCldrLanguages.keys()])(
    '%s is in rtlLanguages only if its likely script is right-to-left',
    (language) => {
      const { script } = new Intl.Locale(language).maximize()

      expect(rtlLanguages.has(language)).toBe(rtlScripts.has(script ?? ''))
    },
  )
})
