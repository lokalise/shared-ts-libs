import { NON_TRANSLATABLE_END_TAG, NON_TRANSLATABLE_START_TAG } from '../nonTranslatableTags.ts'

const nonTranslatableTextPattern = `${NON_TRANSLATABLE_START_TAG}.+?${NON_TRANSLATABLE_END_TAG}`
export const nonTranslatableTextRegexp = new RegExp(nonTranslatableTextPattern)
export const nonTranslatableTextRegexpG = new RegExp(nonTranslatableTextPattern, 'g')

const nonTranslatableTagsPattern = `${NON_TRANSLATABLE_START_TAG}(.+?)${NON_TRANSLATABLE_END_TAG}`
export const nonTranslatableTagsRegexpG = new RegExp(nonTranslatableTagsPattern, 'g')

/**
 * Explanation of the pattern:
 *  `^` -> asserts position at the start of a line
 *  `[...]` -> matches any one of the characters or Unicode property escapes specified within it
 *      `\p{N}`     -> matches any kind of numeric character
 *      `\p{P}`     -> matches any kind of punctuation character
 *      `\p{Sm}`    -> matches any math symbol character
 *      `\p{Sk}`    -> matches any modifier symbol character
 *      `\p{So}`    -> matches any other symbol character
 *      `\p{Emoji}` -> matches any emoji character
 *      `\s` -> matches any whitespace character
 *  `+` -> matches between one and n times
 *  `$` -> asserts position at the end of a line
 *  `u` -> enables unicode mode
 *
 * Note: `\p{S}` matches any kind of symbol character, and it covers all the symbols from `\p{Sm}`, `\p{Sc}`, `\p{Sk}`,
 *  and `\p{So}` categories. However, we don't want to cover `\p{Sc}` (Currency Symbol), so we specify the relevant
 *  subcategories separately.
 *
 * For more info see -> https://github.com/mdn/content/blob/main/files/en-us/web/javascript/reference/regular_expressions/unicode_character_class_escape/index.md
 */
const symbolsAndNumberPattern = /^[\p{N}\p{P}\p{Sm}\p{Sk}\p{So}\p{Emoji}\s]+$/u
export const symbolsAndNumberRegexpG = new RegExp(symbolsAndNumberPattern)

/**
 * Explanation of the pattern:
 *  (
 *      `\d{2,4}` -> matches year format YYYY | YY
 *      `([-\/.])` -> matches the separator character '-' | '/' | '.'
 *      `\d{1,2}` -> matches month format MM | M
 *      `\2`      -> matches the same separator character as the one matched before
 *      `\d{1,2}` -> matches day format DD | D
 *  )
 *  | -> or
 *  (
 *      `\d{1,2}` -> matches day format DD | D
 *      `([-\/.])` -> matches the separator character '-' | '/' | '.'
 *      `\d{1,2}` -> matches month format MM | M
 *      `\4`      -> matches the same separator character as the one matched before
 *      `\d{2,4}` -> matches year format YYYY | YY
 *  )
 */
const datePattern = /(\d{2,4}([-\/.])\d{1,2}\2\d{1,2})|(\d{1,2}([-\/.])\d{1,2}\4\d{2,4})/
export const dateRegexp = new RegExp(datePattern)

/**
 * Explanation of the pattern:
 * `<` -> matches the character '<'
 * `[^<>]*` -> matches any character except '<' and '>', zero or more times
 * `>` -> matches the character '>'
 */
const tagPattern = /<[^<>]*>/
export const tagRegexpG = new RegExp(tagPattern, 'g')
