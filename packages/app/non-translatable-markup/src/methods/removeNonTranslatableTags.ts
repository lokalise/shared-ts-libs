import { nonTranslatableTagsRegexpG } from './utils'

/**
 * Removes any non-translatable tag.
 */
export const removeNonTranslatableTags = (text: string): string =>
  text.replace(nonTranslatableTagsRegexpG, '')
