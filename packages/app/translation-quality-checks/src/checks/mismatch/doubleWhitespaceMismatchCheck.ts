import { extractTextBetweenTags } from '@lokalise/non-translatable-markup'
import type { MismatchCheck, QualityIssueShape } from '../../utils.ts'
import { multisetDiff } from '../utils/multisetDiff.ts'

export type DoubleWhitespaceMismatchIssue = QualityIssueShape<{
  error: 'DOUBLE_WHITESPACE_MISMATCH'
  details: {
    /** Double-whitespace runs present in the reference text but missing from the text. */
    missing: string[]
    /** Double-whitespace runs present in the text but absent from the reference text. */
    added: string[]
  }
}>

// Horizontal whitespace only: line terminators are legitimate formatting, not double whitespace.
const doubleWhitespaceRegexp = /[^\S\r\n]{2,}/g

const doubleWhitespaceRuns = (text: string): string[] =>
  extractTextBetweenTags(text, { keepHtml: true, preserveSpacing: true }).flatMap(
    (piece) => piece.match(doubleWhitespaceRegexp) ?? [],
  )

/**
 * Mismatch check: reports the double-whitespace runs on which the text and the reference text
 * disagree. Runs are paired as a multiset (position-independent, duplicates and run lengths
 * counted, since positions naturally shift between languages): unpaired reference runs are
 * reported as `missing`, unpaired text runs as `added`. Content inside NTC regions is not
 * checked.
 */
export const doubleWhitespaceMismatchCheck: MismatchCheck = (
  text: string,
  compareWith: string,
): DoubleWhitespaceMismatchIssue | null => {
  const { missing, added } = multisetDiff(
    doubleWhitespaceRuns(compareWith),
    doubleWhitespaceRuns(text),
  )

  if (missing.length === 0 && added.length === 0) return null

  return {
    error: 'DOUBLE_WHITESPACE_MISMATCH',
    details: { missing, added },
  }
}
