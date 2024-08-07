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
 *      `\p{S}` -> matches any kind of symbol character
 *      `\p{So}` -> matches any other symbol character
 *      `\p{Emoji}` -> matches any emoji character
 *      `\p{Math}` -> matches any math symbol character
 *  `u` -> enables unicode mode
 */
const symbolsPattern = /[\p{P}\p{S}\p{So}\p{Emoji}\p{Math}']/u

export const symbolsRegexp = new RegExp(symbolsPattern)
