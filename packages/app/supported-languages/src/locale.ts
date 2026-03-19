import { languages } from './constants/languages.ts'
import { regions } from './constants/regions.ts'
import { scripts } from './constants/scripts.ts'
import { standardLocales } from './constants/standard-locales.ts'
import type { Either } from './either.ts'

/**
 * String representation of a locale.
 */
export type Locale = string | `${string}-${string}` | `${string}-${string}-${string}`
/**
 * @deprecated Use Locale instead
 */
export type LocaleString = Locale

/**
 * Object representation of a locale.
 */
export type LocaleObject = {
  language: string
  script?: string
  region?: string
}

export type LanguageDirection = 'ltr' | 'rtl'

/**
 * Verify that `tag` is a valid locale code and all parts of it is in our lists of supported values.
 */
export const isSupportedLocale = (tag: Locale) => {
  try {
    const { language, script, region } = new Intl.Locale(tag)

    if (region && !regions.has(region)) {
      return false
    }

    if (script && !scripts.has(script)) {
      return false
    }

    return languages.has(language)
  } catch (_) {
    return false
  }
}

/**
 * Determine if `tag` is part of our standard locales.
 */
export const isStandardLocale = (tag: Locale): boolean => standardLocales.has(tag)

/**
 * Turn LocaleObject into LocaleString.
 */
export const stringifyLocale = (obj: LocaleObject): Locale =>
  [obj.language, obj.script, obj.region].filter(Boolean).join('-')

/**
 * Parse locale string into object.
 *
 * @throws {RangeError} If locale is structurally invalid or values are not in our supported values
 */
export const parseLocale = (tag: Locale): Either<string, LocaleObject> => {
  if (!isSupportedLocale(tag)) {
    return { error: `Locale tag ${tag} is not supported` }
  }

  const { language, script, region } = new Intl.Locale(tag)

  return { result: { language, script, region } }
}

export const normalizeLocale = (tag: Locale) => {
  /**
   * "und" is used in some systems to mean an "Unknown Language".
   * Throughout our system however, we prefer to use "null" to mean unknown language.*
   * */
  if (tag === 'und') return null

  try {
    return stringifyLocale(new Intl.Locale(tag))
  } catch {
    return null
  }
}

export const getLocaleDirection = (tag: Locale): LanguageDirection | null => {
  try {
    const locale = new Intl.Locale(tag)
    const info = 'textInfo' in locale && locale.textInfo ? locale.textInfo : locale.getTextInfo()
    return info.direction
  } catch (_) {
    return null
  }
}
