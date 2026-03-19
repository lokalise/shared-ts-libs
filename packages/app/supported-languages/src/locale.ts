import type { Language, StandardLocale } from './constants/index.ts'
import { languagesSet } from './constants/languages.ts'
import type { Region } from './constants/regions.ts'
import { regionsSet } from './constants/regions.ts'
import type { Script } from './constants/scripts.ts'
import { scriptsSet } from './constants/scripts.ts'
import { standardLocalesSet } from './constants/standard-locales.ts'
import type { Either } from './either.ts'

/**
 * String representation of a locale.
 */
export type Locale = Language | `${Language}-${Region}` | `${Language}-${Script}-${Region}`
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
 * Determine if `tag` is part of our standard locales.
 */
export const isStandardLocale = (tag: string): tag is StandardLocale => standardLocalesSet.has(tag)

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

export const normalizeLocale = (tag: string) => {
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

export const getLocaleDirection = (tag: string): LanguageDirection | null => {
  try {
    return new Intl.Locale(tag).getTextInfo().direction
  } catch (_) {
    return null
  }
}
