import { standardLocales } from './constants/standard-locales.ts'

/**
 * Get common regions for a language, based on our standard locales.
 */
export const getCommonRegionsForLanguage = (() => {
  const cache: Record<string, Array<string>> = {}

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

  return (language: string): Array<string> => {
    return cache[language] ?? []
  }
})()

/**
 * Get common languages for a region, based on our standard locales.
 */
export const getCommonLanguagesForRegion = (() => {
  const cache: Record<string, Array<string>> = {}

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

  return (region: string): Array<string> => {
    return cache[region] ?? []
  }
})()
