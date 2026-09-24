import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

/**
 * Appends a markdown section to a report k6 wrote, such as the resource table
 * from `formatResourcesSection`. Creates the file when there is none, for a
 * script with no `handleSummary` of its own; call {@link resetReport} first
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
  /** Whether a report exists, which after {@link resetReport} means this run wrote it. */
  written(): boolean
}

/**
 * Removes the previous run's report before a run, so that afterwards a file at
 * `reportPath` can only be one k6 wrote in this run. k6 writes its summary from
 * `handleSummary`, which it never reaches when the script fails to initialise
 * (an unknown scenario, a syntax error).
 */
export function resetReport(reportPath: string): ReportWatch {
  rmSync(reportPath, { force: true })
  return { written: () => existsSync(reportPath) }
}
