import type { Either } from '@lokalise/node-core'

import type { Language } from './languages.js'
import { languages, languagesSet } from './languages.js'
import type { Region } from './regions.js'
import { regions, regionsSet } from './regions.js'
import type { Script } from './scripts.js'
import { scripts, scriptsSet } from './scripts.js'
import type { StandardLocale } from './standard-locales.js'
import { standardLocales, standardLocalesSet } from './standard-locales.js'
import {lokaliseSupportedLanguagesAndLocales} from './lokaliseLanguages.js';

/**
 * String representation of a locale.
 */
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export type LocaleString = Language | `${Language}-${Region}` | `${Language}-${Script}-${Region}`

/**
 * Object representation of a locale.
 */
export type LocaleObject = {
  language: string
  script?: string
  region?: string
}

/**
 * Get list of all our standard locale codes.
 */
export const getStandardLocales = () => {
  return standardLocales
}

/**
 * Get list of all available languages we support.
 */
export const getAllLanguages = () => {
  return languages
}

/**
 * Get list of all available scripts we support.
 */
export const getAllScripts = () => {
  return scripts
}

/**
 * Get list of all available regions we support.
 */
export const getAllRegions = () => {
  return regions
}

export const getLokaliseSupportedLanguagesAndLocales = () => {
  return lokaliseSupportedLanguagesAndLocales
}

/**
 * Determine if `tag` is part of our standard locales.
 */
export const isStandardLocale = (tag: string): tag is StandardLocale => {
  return standardLocalesSet.has(tag as StandardLocale)
}

/**
 * Parse locale string into object.
 *
 * @throws {RangeError} If locale is structurally invalid or values are not in our supported values
 */
export const parseLocale = (tag: LocaleString): Either<string, LocaleObject> => {
  if (!isSupportedLocale(tag)) {
    return { error: `Locale tag ${tag} is not supported` }
  }

  const { language, script, region } = new Intl.Locale(tag)

  return { result: { language, script, region } }
}

/**
 * Turn LocaleObject into LocaleString.
 */
export const stringifyLocale = (obj: LocaleObject): LocaleString => {
  return [obj.language, obj.script, obj.region].filter(Boolean).join('-')
}

/**
 * Verify that `tag` is a valid locale code and all parts of it is in our lists of supported values.
 */
export const isSupportedLocale = (tag: string) => {
  try {
    const { language, script, region } = new Intl.Locale(tag)

    if (region && !regionsSet.has(region)) {
      return false
    }

    if (script && !scriptsSet.has(script)) {
      return false
    }

    return languagesSet.has(language)
  } catch (_) {
    return false
  }
}

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

export const normalizeLocale = (tag: string) => {
  /**
   * "und" is used in some systems to mean an "Unknown Language".
   * Throughout our system however, we prefer to use "null" to mean unknown language.*
   * */
  if (tag === 'und') return null

  try {
    return stringifyLocale(new Intl.Locale(tag))
  } catch (_) {
    return null
  }
}

export const getLanguageNameInEnglish = (tag: LocaleString): string | null => {
  return getLocalisedLanguageName(tag, 'en')
}

export const getLocalisedLanguageName = (
  tag: LocaleString,
  destinationTag: LocaleString,
  options?: Omit<Partial<Intl.DisplayNamesOptions>, 'type'>,
): string | null => {
  if (!isSupportedLocale(tag) || !isSupportedLocale(destinationTag)) {
    return null
  }

  const displayNames = new Intl.DisplayNames([destinationTag], {
    type: 'language',
    languageDisplay: 'standard',
    ...options,
  })

  try {
    const displayName = displayNames.of(tag)

    if (displayName === 'root') {
      return null
    }

    return displayName ?? null
  } catch (_) {
    return null
  }
}
