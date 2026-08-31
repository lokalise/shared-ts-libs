import type { MismatchCheck, QualityIssueShape } from '../../utils.ts'

export type TrailingWhitespaceMismatchIssue = QualityIssueShape<{
  error: 'TRAILING_WHITESPACE_MISMATCH'
  details: {
    /** Trailing whitespace found in the source. */
    source: string
    /** Trailing whitespace found in the target. */
    target: string
  }
}>

const trailingWhitespaceRegexp = /\s*$/

/**
 * Mismatch check: reports when the trailing whitespace of the text differs from the trailing
 * whitespace of the reference text.
 */
export const trailingWhitespaceMismatchCheck: MismatchCheck = (
  text: string,
  compareWith: string,
): TrailingWhitespaceMismatchIssue | undefined => {
  const textTrailing = text.match(trailingWhitespaceRegexp)?.[0] ?? ''
  const compareWithTrailing = compareWith.match(trailingWhitespaceRegexp)?.[0] ?? ''

  if (textTrailing === compareWithTrailing) return undefined

  return {
    error: 'TRAILING_WHITESPACE_MISMATCH',
    details: { source: compareWithTrailing, target: textTrailing },
  }
}
