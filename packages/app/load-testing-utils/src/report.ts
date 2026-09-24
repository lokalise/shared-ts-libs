import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'

/**
 * Appends a markdown section to a report k6 wrote, such as the resource table
 * from `formatResourcesSection`. Creates the file when k6 wrote none, which is
 * what happens when the run failed before its summary.
 */
export function appendReportSection(reportPath: string, section: string): void {
  if (!existsSync(reportPath)) {
    writeFileSync(reportPath, section)
    return
  }
  const existing = readFileSync(reportPath, 'utf8')
  appendFileSync(reportPath, `${existing.endsWith('\n') ? '' : '\n'}\n${section}`)
}
