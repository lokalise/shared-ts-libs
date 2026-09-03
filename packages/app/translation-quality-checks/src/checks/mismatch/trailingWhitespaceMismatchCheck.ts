import type { QualityIssueShape } from '../../utils.ts'

export type TrailingWhitespaceMismatchIssue = QualityIssueShape<{
  error: 'TRAILING_WHITESPACE_MISMATCH'
  details: {
    /** Trailing whitespace found in the source. */
    source: string
    /** Trailing whitespace found in the target. */
    target: string
  }
}>

/**
 * Mismatch check: reports when the trailing whitespace of the text differs from the trailing
 * whitespace of the reference text.
 */
export const trailingWhitespaceMismatchCheck = (
  text: string,
  compareWith: string,
): TrailingWhitespaceMismatchIssue | null => {
  const textTrailing = text.slice(text.trimEnd().length)
  const compareWithTrailing = compareWith.slice(compareWith.trimEnd().length)

  if (textTrailing === compareWithTrailing) return null

  return {
    error: 'TRAILING_WHITESPACE_MISMATCH',
    details: { source: compareWithTrailing, target: textTrailing },
  }
}
