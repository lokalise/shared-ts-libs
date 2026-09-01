import type { QualityIssueShape } from '../../utils.ts'
import { doubleWhitespaceRuns } from '../utils/doubleWhitespaceRuns.ts'

export type DoubleWhitespaceIssue = QualityIssueShape<{
  error: 'DOUBLE_WHITESPACE'
  details: {
    /** Every double-whitespace run found in the text, e.g. `['  ', ' \t']`. */
    whitespaces: string[]
  }
}>

/**
 * Single-text check: reports every run of two or more consecutive horizontal whitespace
 * characters found in the given text. Content inside NTC regions is not checked.
 */
export const doubleWhitespaceCheck = (text: string): DoubleWhitespaceIssue | null => {
  const whitespaces = doubleWhitespaceRuns(text)

  if (whitespaces.length === 0) return null

  return {
    error: 'DOUBLE_WHITESPACE',
    details: { whitespaces },
  }
}
