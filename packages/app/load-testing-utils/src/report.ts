import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'

/**
 * Appends a markdown section to a report k6 wrote, such as the resource table
 * from `formatResourcesSection`. Creates the file when there is none, for a
 * script with no `handleSummary` of its own; check {@link watchReport} first
 * so a failed run does not extend the previous run's report.
 */
export function appendReportSection(reportPath: string, section: string): void {
  if (!existsSync(reportPath)) {
    writeFileSync(reportPath, section)
    return
  }
  const existing = readFileSync(reportPath, 'utf8')
  appendFileSync(reportPath, `${existing.endsWith('\n') ? '' : '\n'}\n${section}`)
}

export type ReportWatch = {
  /** Whether the report was created or rewritten since {@link watchReport}. */
  written(): boolean
}

const modifiedAt = (path: string): number | undefined =>
  statSync(path, { throwIfNoEntry: false })?.mtimeMs

/**
 * Notes the report's modification time before a run, to tell afterwards
 * whether k6 wrote it. k6 writes its summary from `handleSummary`, which it
 * never reaches when the script fails to initialise (an unknown scenario, a
 * syntax error), and the file on disk is then the previous run's.
 */
export function watchReport(reportPath: string): ReportWatch {
  const before = modifiedAt(reportPath)
  return {
    written: () => {
      const after = modifiedAt(reportPath)
      return after !== undefined && after !== before
    },
  }
}
