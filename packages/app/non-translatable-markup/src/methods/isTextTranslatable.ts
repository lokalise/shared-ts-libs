import { nonTranslatableTextRegexp } from './regex'

/**
 * Returns true if the text is entirely encapsulated in non-translatable tags.
 */
export const isTextTranslatable = (text: string): boolean => {
  const parts = text.split(nonTranslatableTextRegexp).map((part) => part.trim())

  return parts.some((part) => part !== '')
}
