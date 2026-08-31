import { extractNTCTagsWithContent } from '@lokalise/non-translatable-markup'
import type { MismatchCheck, QualityIssueShape } from '../../utils.ts'
import { multisetDiff } from '../utils/multisetDiff.ts'

export type NonTranslatableTagsMismatchIssue = QualityIssueShape<{
  error: 'NON_TRANSLATABLE_TAGS_MISMATCH'
  details: {
    /** Non-translatable tokens present in the reference text but missing from the text. */
    missing: string[]
    /** Non-translatable tokens present in the text but absent from the reference text. */
    added: string[]
  }
}>

// The NTC markers are single characters, so slicing them off yields the wrapped token.
const nonTranslatableTokens = (text: string): string[] =>
  extractNTCTagsWithContent(text).map((region) => region.slice(1, -1))

/**
 * Mismatch check: reports the non-translatable tokens (placeholders, tags — the content wrapped
 * in NTC markers) on which the text and the reference text disagree. Tokens are paired as a
 * multiset (position-independent, duplicates counted, exact content): unpaired reference tokens
 * are reported as `missing`, unpaired text tokens as `added`.
 */
export const nonTranslatableTagsMismatchCheck: MismatchCheck = (
  text: string,
  compareWith: string,
): NonTranslatableTagsMismatchIssue | undefined => {
  const { missing, added } = multisetDiff(
    nonTranslatableTokens(compareWith),
    nonTranslatableTokens(text),
  )

  if (missing.length === 0 && added.length === 0) return undefined

  return {
    error: 'NON_TRANSLATABLE_TAGS_MISMATCH',
    details: { missing, added },
  }
}
