import type { Language } from './constants/index.ts'
import type { Region } from './constants/regions.ts'
import { standardLocales } from './constants/standard-locales.ts'

/**
 * Get common regions for a language, based on our standard locales.
 */
export const getCommonRegionsForLanguage = (() => {
  const cache: Record<Language, Array<Region>> = {}

  // Create a mapping of languages to common regions up front
  for (const locale of standardLocales) {
    const { language, region } = new Intl.Locale(locale)

    if (!region) {
      continue
    }

    const current = cache[language] ?? []
    current.push(region)
    cache[language] = current
  }

  return (language: string): Array<Region> => {
    return cache[language] ?? []
  }
})()

/**
 * Get common languages for a region, based on our standard locales.
 */
export const getCommonLanguagesForRegion = (() => {
  const cache: Record<Region, Array<Language>> = {}

  // Create a mapping of languages to common regions up front
  for (const locale of standardLocales) {
    const { language, region } = new Intl.Locale(locale)

    if (!region) {
      continue
    }

    const current = cache[region] ?? []
    current.push(language)
    cache[region] = current
  }

  return (region: string): Array<Language> => {
    return cache[region] ?? []
  }
})()
