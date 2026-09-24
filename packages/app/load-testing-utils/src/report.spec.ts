import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appendReportSection, resetReport } from './report.ts'

const reportPath = () => join(mkdtempSync(join(tmpdir(), 'report-')), 'k6-report.md')

describe('appendReportSection', () => {
  it('creates the report when there is none', () => {
    const path = reportPath()
    appendReportSection(path, '## Resources\n')
    expect(readFileSync(path, 'utf8')).toBe('## Resources\n')
  })

  it('separates the section from the report with one blank line', () => {
    const withNewline = reportPath()
    writeFileSync(withNewline, '# Run\n')
    appendReportSection(withNewline, '## Resources\n')
    expect(readFileSync(withNewline, 'utf8')).toBe('# Run\n\n## Resources\n')

    const withoutNewline = reportPath()
    writeFileSync(withoutNewline, '# Run')
    appendReportSection(withoutNewline, '## Resources\n')
    expect(readFileSync(withoutNewline, 'utf8')).toBe('# Run\n\n## Resources\n')
  })
})

describe('resetReport', () => {
  it("removes the previous run's report", () => {
    const path = reportPath()
    writeFileSync(path, '# Previous run\n')
    const watch = resetReport(path)

    expect(existsSync(path)).toBe(false)
    expect(watch.written()).toBe(false)
  })

  it('reads a run that wrote nothing as not written', () => {
    const watch = resetReport(reportPath())
    expect(watch.written()).toBe(false)
  })

  it('sees a report k6 wrote after the reset', () => {
    const path = reportPath()
    writeFileSync(path, '# Previous run\n')
    const watch = resetReport(path)

    writeFileSync(path, '# Run\n')
    expect(watch.written()).toBe(true)
  })
})
