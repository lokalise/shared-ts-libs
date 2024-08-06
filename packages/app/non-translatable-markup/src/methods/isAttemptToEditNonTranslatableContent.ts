import { isTextTranslatable } from './isTextTranslatable'
import { nonTranslatableTextRegexpG } from './utils'

/**
 * Compares two strings and returns true if the new string tries to edit the non-translatable content within
 * the original string, or add/remove one or more non-translatable tags.
 */
export const isAttemptToEditNonTranslatableContent = (
  text: string,
  updatedText: string,
): boolean => {
  if (!isTextTranslatable(updatedText)) {
    return true
  }

  const nonTranslatableContentInText = extractTextBetweenTags(text)
  const nonTranslatableContentInUpdatedText = extractTextBetweenTags(updatedText)

  if (nonTranslatableContentInText.length !== nonTranslatableContentInUpdatedText.length) {
    return true
  }

  const sortedNonTranslatableContentInText = nonTranslatableContentInText.sort()
  const sortedNonTranslatableContentInUpdatedText = nonTranslatableContentInUpdatedText.sort()

  for (let i = 0; i < sortedNonTranslatableContentInText.length; i++) {
    if (sortedNonTranslatableContentInText[i] !== sortedNonTranslatableContentInUpdatedText[i]) {
      return true
    }
  }

  return false
}

// TODO: extract to utils file so we can test it independently
const extractTextBetweenTags = (text: string): string[] => {
  const matches = []

  let match = nonTranslatableTextRegexpG.exec(text)
  while (match !== null) {
    matches.push(match[0])
    match = nonTranslatableTextRegexpG.exec(text)
  }

  return matches
}
