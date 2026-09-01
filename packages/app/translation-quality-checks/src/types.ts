import type { MismatchQualityIssue, SingleTextQualityIssue } from './utils.ts'

/**
 * Issues the library can report.
 */
export type QualityIssue = SingleTextQualityIssue | MismatchQualityIssue

/**
 * Error codes for every quality check the library can report.
 */
export const QualityIssueErrorEnum = {
  LEADING_WHITESPACE_MISMATCH: 'LEADING_WHITESPACE_MISMATCH',
  TRAILING_WHITESPACE_MISMATCH: 'TRAILING_WHITESPACE_MISMATCH',
  DOUBLE_WHITESPACE_MISMATCH: 'DOUBLE_WHITESPACE_MISMATCH',
  NON_TRANSLATABLE_TAGS_MISMATCH: 'NON_TRANSLATABLE_TAGS_MISMATCH',
  LEADING_WHITESPACE: 'LEADING_WHITESPACE',
  TRAILING_WHITESPACE: 'TRAILING_WHITESPACE',
  DOUBLE_WHITESPACE: 'DOUBLE_WHITESPACE',
} as const satisfies { [K in QualityIssue['error']]: K }

export type QualityIssueError = QualityIssue['error']
