import {
  type LeadingWhitespaceMismatchIssue,
  leadingWhitespaceMismatchCheck,
} from './checks/mismatch/leadingWhitespaceMismatchCheck.ts'
import {
  type TrailingWhitespaceMismatchIssue,
  trailingWhitespaceMismatchCheck,
} from './checks/mismatch/trailingWhitespaceMismatchCheck.ts'
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
  LeadingWhitespaceIssue | TrailingWhitespaceIssue
>

/**
 * Issues detectable only by comparing the text against a reference text
 */
export type MismatchQualityIssue = QualityIssueShape<
  LeadingWhitespaceMismatchIssue | TrailingWhitespaceMismatchIssue
>

/**
 * Contract of a single-text check.
 */
export type SingleTextCheck = (text: string) => SingleTextQualityIssue | undefined

/**
 * Contract of a mismatch check.
 */
export type MismatchCheck = (text: string, compareWith: string) => MismatchQualityIssue | undefined

type ByError<Issue extends QualityIssueBase, Value> = { [K in Issue['error']]: Value }

/**
 * Single-text checks keyed by the error they report.
 */
export const singleTextChecksByError = {
  LEADING_WHITESPACE: leadingWhitespaceCheck,
  TRAILING_WHITESPACE: trailingWhitespaceCheck,
} as const satisfies ByError<SingleTextQualityIssue, SingleTextCheck>

/**
 * Mismatch checks keyed by the error they report.
 */
export const mismatchChecksByError = {
  LEADING_WHITESPACE_MISMATCH: leadingWhitespaceMismatchCheck,
  TRAILING_WHITESPACE_MISMATCH: trailingWhitespaceMismatchCheck,
} as const satisfies ByError<MismatchQualityIssue, MismatchCheck>
