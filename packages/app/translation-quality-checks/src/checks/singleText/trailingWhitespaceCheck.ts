import type { QualityIssueShape, SingleTextCheck } from '../../utils.ts'

export type TrailingWhitespaceIssue = QualityIssueShape<{
  error: 'TRAILING_WHITESPACE'
  details: undefined
}>

const trailingWhitespaceRegexp = /\s$/

/**
 * Single-text check: reports when the given text ends with whitespace.
 */
export const trailingWhitespaceCheck: SingleTextCheck = (
  text: string,
): TrailingWhitespaceIssue | null => {
  if (!trailingWhitespaceRegexp.test(text)) return null

  return {
    error: 'TRAILING_WHITESPACE',
    details: undefined,
  }
}
