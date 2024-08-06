export const NON_TRANSLATABLE_START_TAG = '\uE101'
export const NON_TRANSLATABLE_END_TAG = '\uE102'

const nonTranslatableTextPattern = `${NON_TRANSLATABLE_START_TAG}.*?${NON_TRANSLATABLE_END_TAG}`
const nonTranslatableTextRegexp = new RegExp(nonTranslatableTextPattern)
const nonTranslatableTextRegexpG = new RegExp(nonTranslatableTextPattern, 'g')
const nonTranslatableTagsRegexpG = new RegExp(
  `[${NON_TRANSLATABLE_START_TAG}${NON_TRANSLATABLE_END_TAG}]`,
  'g',
)

/**
 * Returns true if the text is entirely encapsulated in non-translatable tags.
 */
export const isTextTranslatable = (text: string): boolean => {
  const parts = text.split(nonTranslatableTextRegexp).map((part) => part.trim())

  return parts.some((part) => part !== '')
}

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

const extractTextBetweenTags = (text: string): string[] => {
  const matches = []
  let match = nonTranslatableTextRegexpG.exec(text)

  while (match !== null) {
    matches.push(match[0])
    match = nonTranslatableTextRegexpG.exec(text)
  }

  return matches
}

/**
 * Removes any non-translatable tag.
 */
export const removeNonTranslatableTags = (text: string): string => {
  return text.replace(nonTranslatableTagsRegexpG, '')
}
