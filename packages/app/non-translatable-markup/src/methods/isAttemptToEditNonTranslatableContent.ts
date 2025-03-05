import { nonTranslatableTextRegexpG } from './utils.js'

/**
 * Compares two strings and returns true if the new string tries to edit the non-translatable content within
 * the original string, or add/remove one or more non-translatable tags.
 */
export const isAttemptToEditNonTranslatableContent = (
  text: string,
  updatedText: string,
): boolean => {
  // early return if the text is the same
  if (text === updatedText) return false

  const nonTranslatableContentInText = extractNTCTagsWithContent(text)
  const nonTranslatableContentInUpdatedText = extractNTCTagsWithContent(updatedText)

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

const extractNTCTagsWithContent = (text: string): string[] => {
  const matches = []

  let match = nonTranslatableTextRegexpG.exec(text)
  while (match !== null) {
    matches.push(match[0])
    match = nonTranslatableTextRegexpG.exec(text)
  }

  return matches
}
