import type { QualityIssue, QualityIssueError } from './types.ts'
import { QualityIssueErrorEnum } from './types.ts'
import {
  type MismatchCheck,
  mismatchChecksByError,
  type SingleTextCheck,
  type SingleTextQualityIssue,
  singleTextChecksByError,
} from './utils.ts'

type SingleTextDetectQualityIssuesOptions = {
  /** Checks to run; defaults to all. Only single-text checks can run on a single text. */
  checksToInclude?: SingleTextQualityIssue['error'][]
  /** Checks to skip; wins over `checksToInclude` on overlap. */
  checksToExclude?: SingleTextQualityIssue['error'][]
}

type PairDetectQualityIssuesOptions = {
  /** Checks to run; defaults to all. */
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
 * `compareWith` — typically the text it was translated from, but any reference text works (e.g.
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
  const checksToRun = resolveChecksToRun(typeof second === 'string' ? third : second)

  const issues: QualityIssue[] = []

  for (const check of checksToRun) {
    const singleTextIssue = singleTextChecks[check]?.(text)
    if (singleTextIssue) issues.push(singleTextIssue)

    if (compareWith === undefined) continue

    const mismatchIssue = mismatchChecks[check]?.(text, compareWith)
    if (mismatchIssue) issues.push(mismatchIssue)
  }

  return issues
}

const resolveChecksToRun = (options?: DetectQualityIssuesOptions): QualityIssueError[] => {
  const checksToInclude = new Set(
    options?.checksToInclude?.length
      ? options.checksToInclude
      : Object.values(QualityIssueErrorEnum),
  )
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
