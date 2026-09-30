import { nonCldrLanguages } from '../constants/non-cldr-languages.ts'
import type { Locale } from './locale.ts'
import { isSupportedLocale } from './locale.ts'

export const getLocalisedLanguageName = (
  tag: Locale,
  destinationTag: Locale,
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
    // CLDR has no names for non-CLDR languages, so Intl.DisplayNames returns the language code.
    // English gets our own name, other destinations the maximized tag, e.g. "afb (Arabisch, Kuwait)".
    const locale = new Intl.Locale(tag)
    const nonCldrName = nonCldrLanguages.get(locale.language)
    const isEnglishDestination = new Intl.Locale(destinationTag).language === 'en'

    const displayName =
      nonCldrName && !isEnglishDestination
        ? displayNames.of(locale.maximize().toString())
        : displayNames.of(tag)

    /* v8 ignore start */
    if (!displayName || displayName === 'root') return null
    /* v8 ignore stop */

    return nonCldrName && isEnglishDestination
      ? displayName.replace(locale.language, nonCldrName)
      : displayName
  } catch {
    /* v8 ignore start */
    return null
    /* v8 ignore stop */
  }
}

export const getLanguageNameInEnglish = (tag: Locale): string | null =>
  getLocalisedLanguageName(tag, 'en')
