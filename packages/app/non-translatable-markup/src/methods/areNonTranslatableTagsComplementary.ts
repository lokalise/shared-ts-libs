import { NON_TRANSLATABLE_END_TAG, NON_TRANSLATABLE_START_TAG } from '../nonTranslatableTags.ts'

const nonTranslatableOpenOrCloseTagRegexp = new RegExp(
  `${NON_TRANSLATABLE_START_TAG}|${NON_TRANSLATABLE_END_TAG}`,
  'g',
)

/**
 * Checks if non-translatable tags in the given text are correct:
 * - each start tag has a corresponding end tag.
 * - each end tag has a corresponding start tag.
 */
export const areNonTranslatableTagsComplementary = (text: string): boolean => {
  let tagOpen = false
  for (const match of text.matchAll(nonTranslatableOpenOrCloseTagRegexp)) {
    const tag = match[0]
    if (tag === NON_TRANSLATABLE_START_TAG) {
      if (tagOpen) {
        return false // found a start tag while another one is already open
      }
      tagOpen = true
    } else if (tag === NON_TRANSLATABLE_END_TAG) {
      if (!tagOpen) {
        return false // found an end tag without a corresponding start tag
      }
      tagOpen = false
    }
  }
  return !tagOpen // if tagOpen is true, it means there is an unclosed tag
}
