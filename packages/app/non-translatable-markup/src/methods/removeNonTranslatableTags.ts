import { nonTranslatableTagsRegexpG } from './utils.js'

/**
 * Removes any non-translatable tag.
 */
export const removeNonTranslatableTags = (text: string): string =>
  text.replace(nonTranslatableTagsRegexpG, '$1')
