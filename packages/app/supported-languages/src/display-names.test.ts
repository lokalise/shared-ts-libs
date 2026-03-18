import { describe, expect, it } from 'vitest'
import { getLanguageNameInEnglish, getLocalisedLanguageName } from './display-names.ts'

describe('getLanguageNameInEnglish', () => {
  it('returns name for a language code', () => {
    expect(getLanguageNameInEnglish('es')).toBe('Spanish')
    expect(getLanguageNameInEnglish('en')).toBe('English')
    expect(getLanguageNameInEnglish('fr')).toBe('French')
  })

  it('returns name for a language-region locale', () => {
    expect(getLanguageNameInEnglish('en-US')).toBe('English (United States)')
    expect(getLanguageNameInEnglish('pt-BR')).toBe('Portuguese (Brazil)')
  })

  it('returns name for a language-script-region locale', () => {
    expect(getLanguageNameInEnglish('bs-Latn-BA')).toBe('Bosnian (Latin, Bosnia & Herzegovina)')
    expect(getLanguageNameInEnglish('zh-Hans-CN')).toBe('Chinese (Simplified, China)')
  })

  it('returns null for an empty string', () => {
    expect(getLanguageNameInEnglish('')).toBeNull()
  })

  it('returns null for an unsupported tag', () => {
    expect(getLanguageNameInEnglish('3141516')).toBeNull()
  })
})

describe('getLocalisedLanguageName', () => {
  it('returns name in the destination language', () => {
    expect(getLocalisedLanguageName('es', 'fr')).toBe('espagnol')
    expect(getLocalisedLanguageName('en', 'de')).toBe('Englisch')
    expect(getLocalisedLanguageName('fr', 'es')).toBe('francés')
  })

  it('returns name for a language-region locale', () => {
    expect(getLocalisedLanguageName('en-US', 'fr')).toBe('anglais (États-Unis)')
    expect(getLocalisedLanguageName('pt-BR', 'es')).toBe('portugués (Brasil)')
  })

  it('returns name for a language-script-region locale', () => {
    expect(getLocalisedLanguageName('bs-Latn-BA', 'fr')).toBe(
      'bosniaque (latin, Bosnie-Herzégovine)',
    )
  })

  it('respects the languageDisplay option', () => {
    expect(getLocalisedLanguageName('en-US', 'fr', { languageDisplay: 'dialect' })).toBe(
      'anglais américain',
    )
  })

  it('returns null for an invalid source tag', () => {
    expect(getLocalisedLanguageName('', 'en')).toBeNull()
    expect(getLocalisedLanguageName('3141516', 'en')).toBeNull()
  })

  it('returns null for an invalid destination tag', () => {
    expect(getLocalisedLanguageName('fr', 'wow')).toBeNull()
    expect(getLocalisedLanguageName('fr', '')).toBeNull()
  })
})
