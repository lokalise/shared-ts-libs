import { extractTextBetweenTags } from '@lokalise/non-translatable-markup'
import type { MismatchCheck, QualityIssueShape } from '../../utils.ts'

export type DoubleWhitespaceMismatchIssue = QualityIssueShape<{
  error: 'DOUBLE_WHITESPACE_MISMATCH'
  details: {
    /** Double-whitespace runs present in the reference text but missing from the text. */
    missing: string[]
    /** Double-whitespace runs present in the text but absent from the reference text. */
    added: string[]
  }
}>

const doubleWhitespaceRegexp = /\s{2,}/g

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
): DoubleWhitespaceMismatchIssue | undefined => {
  const unpairedCompareWithRuns = new Map<string, number>()
  for (const run of doubleWhitespaceRuns(compareWith)) {
    unpairedCompareWithRuns.set(run, (unpairedCompareWithRuns.get(run) ?? 0) + 1)
  }

  const added: string[] = []
  for (const run of doubleWhitespaceRuns(text)) {
    const count = unpairedCompareWithRuns.get(run) ?? 0
    if (count > 0) unpairedCompareWithRuns.set(run, count - 1)
    else added.push(run)
  }

  const missing: string[] = []
  for (const [run, count] of unpairedCompareWithRuns) {
    missing.push(...Array.from({ length: count }, () => run))
  }

  if (missing.length === 0 && added.length === 0) return undefined

  return {
    error: 'DOUBLE_WHITESPACE_MISMATCH',
    details: { missing, added },
  }
}
