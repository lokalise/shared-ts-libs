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

    if (displayName === 'root') {
      return null
    }

    return displayName ?? null
  } catch (_) {
    return null
  }
}

export const getLanguageNameInEnglish = (tag: Locale): string | null =>
  getLocalisedLanguageName(tag, 'en')
