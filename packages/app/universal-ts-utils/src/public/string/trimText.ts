/**
 * Explanation of the pattern:
 * `^`          -> asserts the position at the start of the string
 * `(?: ... )`  -> non-capturing group, does not save the matched substring for back-references
 *    `[\s\u00A0]`  -> matches:
 *      `\s`          -> any whitespace character (spaces, tabs, line breaks)
 *      `\u00A0`      -> the non-breaking space character (equivalent to `&nbsp;`)
 *      `|`           -> OR operator allows for matching either the left or right pattern
 *      `&nbsp;`      -> matches the literal string `&nbsp;` (HTML entity for non-breaking space)
 * `+`          -> matches one or more occurrences of the preceding pattern
 */
const leadingRegex = /^(?:[\s\u00A0]|&nbsp;)+/

/**
 * Explanation of the pattern:
 * `(?: ... )`  -> non-capturing group, same function as in leadingRegex
 *    `[\s\u00A0]` -> matches:
 *        `\s`      -> any whitespace character
 *        `\u00A0`  -> the non-breaking space character
 *        `|`       -> OR operator to allow matching `&nbsp;`
 *        `&nbsp;`  -> matches the literal string `&nbsp;`
 * `+`          -> matches one or more occurrences
 * `$`          -> asserts the position at the end of the string
 */
const trailingRegex = /(?:[\s\u00A0]|&nbsp;)+$/

const extractOccurrence = (text: string, regex: RegExp): string | undefined => {
  const match = text.match(regex)
  return match ? match[0] : undefined
}

export type TrimmedText = {
  value: string
  prefix?: string
  suffix?: string
}

/**
 * Trims whitespace and `&nbsp;` characters from the beginning and end of a given string.
 * Extracts and provides the removed part as `prefix` and `suffix` properties.
 *
 * @param {string} text - The input string from which to trim leading and trailing whitespace
 * and `&nbsp;` characters.
 * @returns {TrimmedText} An object containing:
 *   - `value`: the trimmed string with leading and trailing whitespace and `&nbsp;` removed.
 *   - `prefix`: the leading whitespace and `&nbsp;` characters that were removed, if any.
 *   - `suffix`: the trailing whitespace and `&nbsp;` characters that were removed, if any.
 *
 * @example
 * ```typescript
 * const text = '  Hello, World!  '
 * const result = trimText(text) // Returns: { value: 'Hello, World!', prefix: '  ', suffix: '  ' }
 * ```
 */
export const trimText = (text: string): TrimmedText => ({
  value: text.replace(leadingRegex, '').replace(trailingRegex, ''),
  prefix: extractOccurrence(text, leadingRegex),
  suffix: extractOccurrence(text, trailingRegex),
})
