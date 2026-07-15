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
    const displayName = displayNames.of(tag)

    /* v8 ignore start */
    if (!displayName || displayName === 'root') return null
    /* v8 ignore stop */

    return displayName
  } catch {
    /* v8 ignore start */
    return null
    /* v8 ignore stop */
  }
}

export const getLanguageNameInEnglish = (tag: Locale): string | null =>
  getLocalisedLanguageName(tag, 'en')
