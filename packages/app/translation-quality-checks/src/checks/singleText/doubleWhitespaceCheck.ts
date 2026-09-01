import { extractTextBetweenTags } from '@lokalise/non-translatable-markup'
import type { QualityIssueShape, SingleTextCheck } from '../../utils.ts'

export type DoubleWhitespaceIssue = QualityIssueShape<{
  error: 'DOUBLE_WHITESPACE'
  details: {
    /** Every double-whitespace run found in the text, e.g. `['  ', ' \t']`. */
    whitespaces: string[]
  }
}>

// Horizontal whitespace only: line terminators are legitimate formatting, not double whitespace.
const doubleWhitespaceRegexp = /[^\S\r\n]{2,}/g

/**
 * Single-text check: reports every run of two or more consecutive horizontal whitespace
 * characters found in the given text. Content inside NTC regions is not checked: the text is
 * split by NTC region and every piece is evaluated on its own, so a run can never span a region
 * boundary.
 */
export const doubleWhitespaceCheck: SingleTextCheck = (
  text: string,
): DoubleWhitespaceIssue | null => {
  const whitespaces = extractTextBetweenTags(text, {
    keepHtml: true,
    preserveSpacing: true,
  }).flatMap((piece) => piece.match(doubleWhitespaceRegexp) ?? [])

  if (whitespaces.length === 0) return null

  return {
    error: 'DOUBLE_WHITESPACE',
    details: { whitespaces },
  }
}
