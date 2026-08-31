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
): LeadingWhitespaceIssue | undefined => {
  if (!leadingWhitespaceRegexp.test(text)) return undefined

  return { error: 'LEADING_WHITESPACE', details: undefined }
}
