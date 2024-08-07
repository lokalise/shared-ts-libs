import { NON_TRANSLATABLE_END_TAG, NON_TRANSLATABLE_START_TAG } from '../nonTranslatableTags'

const nonTranslatableTextPattern = `${NON_TRANSLATABLE_START_TAG}.*?${NON_TRANSLATABLE_END_TAG}`
export const nonTranslatableTextRegexp = new RegExp(nonTranslatableTextPattern)
export const nonTranslatableTextRegexpG = new RegExp(nonTranslatableTextPattern, 'g')

const nonTranslatableTagsPattern = `[${NON_TRANSLATABLE_START_TAG}${NON_TRANSLATABLE_END_TAG}]`
export const nonTranslatableTagsRegexpG = new RegExp(nonTranslatableTagsPattern, 'g')

/**
 * Explanation of the pattern:
 *  `[...]` -> matches any one of the characters or Unicode property escapes specified within it
 *      `\p{P}` -> matches any kind of punctuation character
 *      `\p{Sm}` -> matches any math symbol character
 *      `\p{Sk}` -> matches any modifier symbol character
 *      `\p{So}` -> matches any other symbol character
 *      `\p{Emoji}` -> matches any emoji character
 *  `u` -> enables unicode mode
 *
 * Note: `\p{S}` matches any kind of symbol character, and it covers all the symbols from `\p{Sm}`, `\p{Sc}`, `\p{Sk}`,
 *  and `\p{So}` categories. However, we don't want to cover `\p{Sc}` (Currency Symbol), so we specify the relevant
 *  subcategories separately.
 *
 * For more info see -> https://github.com/mdn/content/blob/main/files/en-us/web/javascript/reference/regular_expressions/unicode_character_class_escape/index.md
 */
const symbolsPattern = /[\p{P}\p{Sm}\p{Sk}\p{So}\p{Emoji}']/u

export const symbolsRegexp = new RegExp(symbolsPattern)
