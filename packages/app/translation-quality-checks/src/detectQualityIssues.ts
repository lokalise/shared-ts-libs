import type { QualityIssue, QualityIssueError } from './types.ts'
import { QualityIssueErrorEnum } from './types.ts'
import {
  type MismatchCheck,
  mismatchChecksByError,
  type SingleTextCheck,
  type SingleTextQualityIssue,
  singleTextChecksByError,
} from './utils.ts'

export type SingleTextDetectQualityIssuesOptions = {
  /** Checks to run; defaults to all when omitted, while an empty array runs none. */
  checksToInclude?: SingleTextQualityIssue['error'][]
  /** Checks to skip; wins over `checksToInclude` on overlap. */
  checksToExclude?: SingleTextQualityIssue['error'][]
}

export type PairDetectQualityIssuesOptions = {
  /** Checks to run; defaults to all when omitted, while an empty array runs none. */
  checksToInclude?: QualityIssueError[]
  /** Checks to skip; wins over `checksToInclude` on overlap. */
  checksToExclude?: QualityIssueError[]
  /** Shortcut for excluding every single-text check: only the mismatch checks run. */
  skipSingleTextChecks?: boolean
}

export type DetectQualityIssuesOptions =
  | SingleTextDetectQualityIssuesOptions
  | PairDetectQualityIssuesOptions

/**
 * Runs the quality checks on the given text.
 */
export function detectQualityIssues(
  text: string,
  options?: SingleTextDetectQualityIssuesOptions,
): SingleTextQualityIssue[]
/**
 * Runs the single-text quality checks on the text, plus the mismatch checks comparing it against
 * `compareWith` (typically the text it was translated from, but any reference text works, e.g.
 * another version of the same translation).
 */
export function detectQualityIssues(
  text: string,
  compareWith: string,
  options?: PairDetectQualityIssuesOptions,
): QualityIssue[]
export function detectQualityIssues(
  text: string,
  second?: string | DetectQualityIssuesOptions,
  third?: DetectQualityIssuesOptions,
): QualityIssue[] {
  const compareWith = typeof second === 'string' ? second : undefined
  // JS callers can pass `undefined` in second position; the options then arrive third.
  const checksToRun = resolveChecksToRun(typeof second === 'string' ? third : (second ?? third))

  const issues: QualityIssue[] = []

  for (const check of checksToRun) {
    const singleTextCheck = singleTextChecks[check]
    if (singleTextCheck) {
      const issue = singleTextCheck(text)
      if (issue) issues.push(issue)

      continue
    }

    if (compareWith === undefined) continue

    const mismatchIssue = mismatchChecks[check]?.(text, compareWith)
    if (mismatchIssue) issues.push(mismatchIssue)
  }

  return issues
}

const resolveChecksToRun = (options?: DetectQualityIssuesOptions): QualityIssueError[] => {
  const checksToInclude = new Set(options?.checksToInclude ?? Object.values(QualityIssueErrorEnum))
  const checksToExclude = new Set(options?.checksToExclude ?? [])

  if (options && 'skipSingleTextChecks' in options && options.skipSingleTextChecks) {
    for (const error of Object.keys(singleTextChecksByError)) {
      checksToExclude.add(error as SingleTextQualityIssue['error'])
    }
  }

  return Array.from(checksToInclude).filter((check) => !checksToExclude.has(check))
}

// Widened views of the registries so they can be indexed by any error code
const singleTextChecks: Partial<Record<QualityIssueError, SingleTextCheck>> =
  singleTextChecksByError
const mismatchChecks: Partial<Record<QualityIssueError, MismatchCheck>> = mismatchChecksByError
