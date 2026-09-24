import { readFileSync, statSync } from 'node:fs'
import { fetchJson, fetchText } from './http.ts'
import type { EngineSnapshot, ProbeSnapshot, StatementStats } from './types.ts'

/**
 * What a run cost the service, from the two things a k6 summary cannot see: the
 * service's Prometheus endpoint and the database probe. Scraped at each end of
 * a run and reported as the difference, because a counter otherwise answers
 * "what has this process done since it started".
 */

/** The subset of a Prometheus exposition a resource report reads. */
export type ProcessMetrics = {
  cpuSeconds?: number
  residentBytes?: number
  heapUsedBytes?: number
  /** Cumulative seconds spent in GC, summed over every collector kind. */
  gcSeconds?: number
  eventLoopLagP99Seconds?: number
}

/**
 * Reads the samples a report uses out of a Prometheus text exposition, as
 * prom-client's default metrics name them.
 *
 * Hand-rolled rather than a parser dependency: five metric names, all gauges or
 * counters with no labels or one that has to be summed.
 */
export function parseProcessMetrics(exposition: string): ProcessMetrics {
  const metrics: ProcessMetrics = {}
  let gcSeconds: number | undefined

  for (const line of exposition.split('\n')) {
    const sample = parseSample(line)
    if (!sample) continue

    switch (sample.name) {
      case 'process_cpu_seconds_total':
        metrics.cpuSeconds = sample.value
        break
      case 'process_resident_memory_bytes':
        metrics.residentBytes = sample.value
        break
      case 'nodejs_heap_size_used_bytes':
        metrics.heapUsedBytes = sample.value
        break
      // One series per collector kind, and a report wants the time spent collecting at all.
      case 'nodejs_gc_duration_seconds_sum':
        gcSeconds = (gcSeconds ?? 0) + sample.value
        break
      case 'nodejs_eventloop_lag_p99_seconds':
        metrics.eventLoopLagP99Seconds = sample.value
        break
      default:
        break
    }
  }

  if (gcSeconds !== undefined) metrics.gcSeconds = gcSeconds
  return metrics
}

function parseSample(line: string): { name: string; value: number } | undefined {
  const trimmed = line.trim()
  if (trimmed === '' || trimmed.startsWith('#')) return undefined

  // `name{labels} value [timestamp]`. A label value may hold spaces, so split
  // after the closing brace rather than on the first space.
  const braceEnd = trimmed.indexOf('}')
  const cut = braceEnd === -1 ? trimmed.indexOf(' ') : trimmed.indexOf(' ', braceEnd)
  if (cut === -1) return undefined

  const head = trimmed.slice(0, cut)
  const value = Number.parseFloat(
    trimmed
      .slice(cut + 1)
      .trim()
      .split(' ')[0] ?? '',
  )
  if (Number.isNaN(value)) return undefined

  const braceStart = head.indexOf('{')
  return { name: braceStart === -1 ? head : head.slice(0, braceStart), value }
}

export type ResourceSnapshot = { metrics?: ProcessMetrics; probe?: ProbeSnapshot }

export type EngineDelta = {
  statements: number
  rowsReturned: number
  rowsWritten?: number
}

export type ResourceDelta = {
  cpuSeconds?: number
  gcSeconds?: number
  /** A gauge, so its value at the end rather than a difference. */
  residentBytesAtEnd?: number
  heapUsedBytesAtEnd?: number
  eventLoopLagP99SecondsAtEnd?: number
  /** Per engine, in the order the probe listed them. */
  engines: Record<string, EngineDelta>
  /** Per engine, from the closing scrape, which is cumulative. */
  topStatements: Record<string, StatementStats[]>
  /** Anything a scrape could not answer, so a report says so rather than printing a zero. */
  warnings: string[]
}

export function diffResources(before: ResourceSnapshot, after: ResourceSnapshot): ResourceDelta {
  const warnings: string[] = []
  const delta: ResourceDelta = { engines: {}, topStatements: {}, warnings }

  if (!before.metrics || !after.metrics) {
    warnings.push('service metrics were not scraped; CPU, memory and GC are missing')
  } else {
    delta.cpuSeconds = subtract(after.metrics.cpuSeconds, before.metrics.cpuSeconds)
    delta.gcSeconds = subtract(after.metrics.gcSeconds, before.metrics.gcSeconds)
    delta.residentBytesAtEnd = after.metrics.residentBytes
    delta.heapUsedBytesAtEnd = after.metrics.heapUsedBytes
    delta.eventLoopLagP99SecondsAtEnd = after.metrics.eventLoopLagP99Seconds
  }

  if (!before.probe || !after.probe) {
    warnings.push('the database probe was not reachable; statement and row counts are missing')
    return delta
  }

  for (const [name, afterEngine] of Object.entries(after.probe.engines)) {
    const engine = diffEngine(name, before.probe.engines[name], afterEngine, warnings)
    if (!engine) continue
    delta.engines[name] = engine
    if (afterEngine.topStatements?.length) delta.topStatements[name] = afterEngine.topStatements
  }

  return delta
}

/**
 * One engine's counters as a difference, or nothing and a warning. An engine
 * that answered may still carry a caveat (Postgres counting transactions for
 * want of `pg_stat_statements`), which is reported beside the numbers.
 */
function diffEngine(
  name: string,
  before: EngineSnapshot | undefined,
  after: EngineSnapshot,
  warnings: string[],
): EngineDelta | undefined {
  if (!before?.available || !after.available) {
    warnings.push(`${name}: ${after.reason ?? before?.reason ?? 'unavailable'}`)
    return undefined
  }
  if (after.reason) warnings.push(`${name}: ${after.reason}`)

  const statements = subtract(after.statements, before.statements)
  const rowsReturned = subtract(after.rowsReturned, before.rowsReturned)
  if (statements === undefined || rowsReturned === undefined) {
    warnings.push(`${name}: its statistics were reset during the run`)
    return undefined
  }

  const engine: EngineDelta = { statements, rowsReturned }
  const rowsWritten = subtract(after.rowsWritten, before.rowsWritten)
  if (rowsWritten !== undefined) engine.rowsWritten = rowsWritten
  return engine
}

function subtract(after: number | undefined, before: number | undefined): number | undefined {
  if (after === undefined || before === undefined) return undefined
  // A restart mid-run resets a counter, and a negative delta would be a wrong
  // number in the report. Say nothing instead.
  return after >= before ? after - before : undefined
}

/** What k6 ran, for the rows that divide CPU by it. */
export type RunTotals = {
  /** Wall clock of the k6 test run, setup and teardown included. */
  seconds: number
  requests: number
}

/** Reads the totals out of a parsed k6 summary, the `data` `handleSummary` receives. */
export function readRunTotals(summary: unknown): RunTotals | undefined {
  const data = summary as {
    state?: { testRunDurationMs?: unknown }
    metrics?: { http_reqs?: { values?: { count?: unknown } } }
  } | null
  const durationMs = data?.state?.testRunDurationMs
  const requests = data?.metrics?.http_reqs?.values?.count
  if (!isPositive(durationMs) || !isPositive(requests)) return undefined
  return { seconds: durationMs / 1000, requests }
}

const isPositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

export type ReadRunTotalsFileOptions = {
  /**
   * Epoch ms. A summary older than this is ignored: k6 that failed before its
   * summary leaves the previous run's file in place.
   */
  writtenSince?: number
}

/** `readRunTotals` over a summary written with `JSON.stringify(data)`, or nothing. */
export function readRunTotalsFile(
  summaryPath: string,
  options: ReadRunTotalsFileOptions = {},
): RunTotals | undefined {
  const { writtenSince } = options
  try {
    if (writtenSince !== undefined && statSync(summaryPath).mtimeMs < writtenSince) return undefined
    return readRunTotals(JSON.parse(readFileSync(summaryPath, 'utf8')))
  } catch {
    return undefined
  }
}

/** `run` adds CPU as a share of one core and CPU per request. */
export function formatResourcesSection(delta: ResourceDelta, run?: RunTotals): string {
  const lines = ['## Resources', '', '| Measure | Value |', '|---|---|']
  const row = (label: string, value: string | undefined) => {
    if (value !== undefined) lines.push(`| ${label} | ${value} |`)
  }

  row(
    'CPU seconds',
    format(delta.cpuSeconds, (value) => value.toFixed(2)),
  )
  if (run && delta.cpuSeconds !== undefined) {
    // One core, so a single Node event loop saturates near 100%.
    row('CPU, share of one core', `${((delta.cpuSeconds / run.seconds) * 100).toFixed(0)}%`)
    row('CPU per request', `${((delta.cpuSeconds * 1000) / run.requests).toFixed(2)} ms`)
  }
  row(
    'GC seconds',
    format(delta.gcSeconds, (value) => value.toFixed(2)),
  )
  row('Resident memory at end', format(delta.residentBytesAtEnd, formatMiB))
  row('Heap used at end', format(delta.heapUsedBytesAtEnd, formatMiB))
  row(
    'Event loop lag p99 at end',
    format(delta.eventLoopLagP99SecondsAtEnd, (value) => `${(value * 1000).toFixed(1)} ms`),
  )
  for (const [name, engine] of Object.entries(delta.engines)) {
    row(`${name} statements`, formatCount(engine.statements))
    row(`${name} rows returned`, formatCount(engine.rowsReturned))
    row(`${name} rows written`, format(engine.rowsWritten, formatCount))
  }

  for (const [name, statements] of Object.entries(delta.topStatements)) {
    lines.push(
      '',
      `### ${name} statements by database time`,
      '',
      '| Statement | Calls | Total ms |',
      '|---|---|---|',
    )
    for (const statement of statements) {
      // A pipe inside a statement would end the cell early.
      const query = statement.query.replaceAll('|', '\\|')
      lines.push(
        `| \`${query}\` | ${formatCount(statement.calls)} | ${statement.totalMs.toFixed(1)} |`,
      )
    }
  }

  for (const warning of delta.warnings) lines.push('', `> ${warning}`)

  return `${lines.join('\n')}\n`
}

function format<T>(value: T | undefined, formatter: (value: T) => string): string | undefined {
  return value === undefined ? undefined : formatter(value)
}

const formatMiB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MiB`
const formatCount = (count: number) => count.toLocaleString('en-US')

export type ScrapeResourcesOptions = {
  /** The service's Prometheus endpoint. */
  metricsUrl?: string
  /** The database probe's `/db-stats`, with `?top=N` for a statements table. */
  probeUrl?: string
}

/** One scrape of both sources. Either half is `undefined` when it did not answer. */
export async function scrapeResources(options: ScrapeResourcesOptions): Promise<ResourceSnapshot> {
  const [metrics, probe] = await Promise.all([
    options.metricsUrl
      ? fetchText(options.metricsUrl).then((text) =>
          text === undefined ? undefined : parseProcessMetrics(text),
        )
      : undefined,
    options.probeUrl ? fetchJson<ProbeSnapshot>(options.probeUrl) : undefined,
  ])
  return { metrics, probe }
}

/**
 * Scrapes before and after `body`, and returns what `body` returned with the
 * difference. `startedAt` (epoch ms, before the first scrape) is what
 * `readRunTotalsFile` takes as `writtenSince`.
 */
export async function measureResources<T>(
  scrape: () => Promise<ResourceSnapshot>,
  body: () => Promise<T>,
): Promise<{ result: T; delta: ResourceDelta; startedAt: number }> {
  const startedAt = Date.now()
  const before = await scrape()
  const result = await body()
  const after = await scrape()
  return { result, delta: diffResources(before, after), startedAt }
}
