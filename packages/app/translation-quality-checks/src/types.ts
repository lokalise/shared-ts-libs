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
  LEADING_WHITESPACE: 'LEADING_WHITESPACE',
  TRAILING_WHITESPACE: 'TRAILING_WHITESPACE',
} as const satisfies { [K in QualityIssue['error']]: K }

export type QualityIssueError = QualityIssue['error']
