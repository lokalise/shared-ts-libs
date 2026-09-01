import type { QualityIssueShape, SingleTextCheck } from '../../utils.ts'

export type LeadingWhitespaceIssue = QualityIssueShape<{
  error: 'LEADING_WHITESPACE'
  details: undefined
}>

const leadingWhitespaceRegexp = /^\s/

/**
 * Single-text check: reports when the given text starts with whitespace.
 */
export const leadingWhitespaceCheck: SingleTextCheck = (
  text: string,
): LeadingWhitespaceIssue | null => {
  if (!leadingWhitespaceRegexp.test(text)) return null

  return { error: 'LEADING_WHITESPACE', details: undefined }
}
