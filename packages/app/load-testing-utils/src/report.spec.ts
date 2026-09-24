import { mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appendReportSection, watchReport } from './report.ts'

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

describe('watchReport', () => {
  // An hour back, so a rewrite cannot land on the same timestamp.
  const aged = (path: string) => {
    const past = new Date(Date.now() - 3_600_000)
    utimesSync(path, past, past)
  }

  it('sees a report k6 created', () => {
    const path = reportPath()
    const watch = watchReport(path)
    expect(watch.written()).toBe(false)

    writeFileSync(path, '# Run\n')
    expect(watch.written()).toBe(true)
  })

  it('sees a previous report rewritten', () => {
    const path = reportPath()
    writeFileSync(path, '# Previous run\n')
    aged(path)
    const watch = watchReport(path)

    writeFileSync(path, '# Run\n')
    expect(watch.written()).toBe(true)
  })

  it('does not mistake the previous report for a fresh one', () => {
    const path = reportPath()
    writeFileSync(path, '# Previous run\n')
    aged(path)
    const watch = watchReport(path)

    expect(watch.written()).toBe(false)
  })
})
