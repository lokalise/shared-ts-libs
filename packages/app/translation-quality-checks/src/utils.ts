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

type ByError<Issue extends QualityIssueBase, Value> = { [K in Issue['error']]: Value }

/**
 * Single-text checks keyed by the error they report.
 */
export const singleTextChecksByError = {
  LEADING_WHITESPACE: leadingWhitespaceCheck,
  TRAILING_WHITESPACE: trailingWhitespaceCheck,
  DOUBLE_WHITESPACE: doubleWhitespaceCheck,
} as const satisfies ByError<SingleTextQualityIssue, SingleTextCheck>

/**
 * Mismatch checks keyed by the error they report.
 */
export const mismatchChecksByError = {
  LEADING_WHITESPACE_MISMATCH: leadingWhitespaceMismatchCheck,
  TRAILING_WHITESPACE_MISMATCH: trailingWhitespaceMismatchCheck,
  DOUBLE_WHITESPACE_MISMATCH: doubleWhitespaceMismatchCheck,
  NON_TRANSLATABLE_TAGS_MISMATCH: nonTranslatableTagsMismatchCheck,
} as const satisfies ByError<MismatchQualityIssue, MismatchCheck>
