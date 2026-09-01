import {
  type DoubleWhitespaceMismatchIssue,
  doubleWhitespaceMismatchCheck,
} from './checks/mismatch/doubleWhitespaceMismatchCheck.ts'
import {
  type LeadingWhitespaceMismatchIssue,
  leadingWhitespaceMismatchCheck,
} from './checks/mismatch/leadingWhitespaceMismatchCheck.ts'
import {
  type NonTranslatableTagsMismatchIssue,
  nonTranslatableTagsMismatchCheck,
} from './checks/mismatch/nonTranslatableTagsMismatchCheck.ts'
import {
  type TrailingWhitespaceMismatchIssue,
  trailingWhitespaceMismatchCheck,
} from './checks/mismatch/trailingWhitespaceMismatchCheck.ts'
import {
  type DoubleWhitespaceIssue,
  doubleWhitespaceCheck,
} from './checks/singleText/doubleWhitespaceCheck.ts'
import {
  type LeadingWhitespaceIssue,
  leadingWhitespaceCheck,
} from './checks/singleText/leadingWhitespaceCheck.ts'
import {
  type TrailingWhitespaceIssue,
  trailingWhitespaceCheck,
} from './checks/singleText/trailingWhitespaceCheck.ts'

type QualityIssueBase = {
  error: string
  details: Record<string, unknown> | undefined
}

/**
 * Type-level `satisfies` for issue types: declares an issue checked against `QualityIssueBase`
 * while keeping the exact type.
 */
export type QualityIssueShape<T extends QualityIssueBase> = T

/**
 * Issues detectable on a single text in isolation.
 */
export type SingleTextQualityIssue = QualityIssueShape<
  LeadingWhitespaceIssue | TrailingWhitespaceIssue | DoubleWhitespaceIssue
>

/**
 * Issues detectable only by comparing the text against a reference text
 */
export type MismatchQualityIssue = QualityIssueShape<
  | LeadingWhitespaceMismatchIssue
  | TrailingWhitespaceMismatchIssue
  | DoubleWhitespaceMismatchIssue
  | NonTranslatableTagsMismatchIssue
>

/**
 * Contract of a single-text check.
 */
export type SingleTextCheck = (text: string) => SingleTextQualityIssue | null

/**
 * Contract of a mismatch check.
 */
export type MismatchCheck = (text: string, compareWith: string) => MismatchQualityIssue | null

/**
 * Map keyed by every error code of the given issues, where each key must hold the check that
 * reports exactly that error: a missing key, an extra key, or a check wired under the wrong
 * error is a compile error.
 */
type ByError<Issue extends QualityIssueBase, Args extends unknown[]> = {
  [K in Issue['error']]: (...args: Args) => Extract<Issue, { error: K }> | null
}

/**
 * Single-text checks keyed by the error they report.
 */
export const singleTextChecksByError = {
  LEADING_WHITESPACE: leadingWhitespaceCheck,
  TRAILING_WHITESPACE: trailingWhitespaceCheck,
  DOUBLE_WHITESPACE: doubleWhitespaceCheck,
} as const satisfies ByError<SingleTextQualityIssue, [text: string]>

/**
 * Mismatch checks keyed by the error they report.
 */
export const mismatchChecksByError = {
  LEADING_WHITESPACE_MISMATCH: leadingWhitespaceMismatchCheck,
  TRAILING_WHITESPACE_MISMATCH: trailingWhitespaceMismatchCheck,
  DOUBLE_WHITESPACE_MISMATCH: doubleWhitespaceMismatchCheck,
  NON_TRANSLATABLE_TAGS_MISMATCH: nonTranslatableTagsMismatchCheck,
} as const satisfies ByError<MismatchQualityIssue, [text: string, compareWith: string]>
