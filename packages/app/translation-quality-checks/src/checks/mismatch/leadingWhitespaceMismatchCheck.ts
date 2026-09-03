import type { QualityIssueShape } from '../../utils.ts'

export type LeadingWhitespaceMismatchIssue = QualityIssueShape<{
  error: 'LEADING_WHITESPACE_MISMATCH'
  details: {
    /** Leading whitespace found in the source. */
    source: string
    /** Leading whitespace found in the target. */
    target: string
  }
}>

/**
 * Mismatch check: reports when the leading whitespace of the text differs from the leading
 * whitespace of the reference text.
 */
export const leadingWhitespaceMismatchCheck = (
  text: string,
  compareWith: string,
): LeadingWhitespaceMismatchIssue | null => {
  const textLeading = text.slice(0, text.length - text.trimStart().length)
  const compareWithLeading = compareWith.slice(
    0,
    compareWith.length - compareWith.trimStart().length,
  )

  if (textLeading === compareWithLeading) return null

  return {
    error: 'LEADING_WHITESPACE_MISMATCH',
    details: { source: compareWithLeading, target: textLeading },
  }
}
