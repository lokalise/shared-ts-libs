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
  /** prom-client resets its event-loop histogram on every scrape, so this covers the time since the last one. */
  eventLoopLagP99Seconds?: number
  eventLoopLagMaxSeconds?: number
}

/**
 * Reads the samples a report uses out of a Prometheus text exposition, as
 * prom-client's default metrics name them.
 *
 * Hand-rolled rather than a parser dependency: six metric names, all gauges or
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
      case 'nodejs_eventloop_lag_max_seconds':
        metrics.eventLoopLagMaxSeconds = sample.value
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

/**
 * Event loop lag over the run, one p99 per interval between two scrapes of the
 * metrics endpoint. The worst interval is where a burst shows; a single p99 over
 * the whole run averages it away.
 */
export type EventLoopLag = {
  intervals: number
  p99WorstSeconds: number
  p99MedianSeconds: number
  maxSeconds?: number
}

export type ResourceDelta = {
  cpuSeconds?: number
  gcSeconds?: number
  /** A gauge, so its value at the end rather than a difference. */
  residentBytesAtEnd?: number
  heapUsedBytesAtEnd?: number
  eventLoopLag?: EventLoopLag
  /** Per engine, in the order the probe listed them. */
  engines: Record<string, EngineDelta>
  /** Per engine, what the run itself cost each statement, most expensive first. */
  topStatements: Record<string, StatementStats[]>
  /** Anything a scrape could not answer, so a report says so rather than printing a zero. */
  warnings: string[]
}

export type DiffResourcesOptions = {
  /** Metrics scraped during the run, oldest first, for event loop lag. */
  samples?: ProcessMetrics[]
  /** Rows per statements table. @default 10 */
  top?: number
}

/**
 * The difference between two snapshots. Statements are ranked by what they
 * cost between the two, which needs both snapshots read with
 * `?statements=all`; without that an engine gets a warning instead of a table.
 */
export function diffResources(
  before: ResourceSnapshot,
  after: ResourceSnapshot,
  options: DiffResourcesOptions = {},
): ResourceDelta {
  const { samples = [], top = 10 } = options
  const warnings: string[] = []
  const delta: ResourceDelta = { engines: {}, topStatements: {}, warnings }

  if (!before.metrics || !after.metrics) {
    warnings.push('service metrics were not scraped; CPU, memory and GC are missing')
  } else {
    delta.cpuSeconds = subtract(after.metrics.cpuSeconds, before.metrics.cpuSeconds)
    delta.gcSeconds = subtract(after.metrics.gcSeconds, before.metrics.gcSeconds)
    delta.residentBytesAtEnd = after.metrics.residentBytes
    delta.heapUsedBytesAtEnd = after.metrics.heapUsedBytes
    // The closing scrape is the last interval: it covers the end of the run.
    const lag = summarizeEventLoopLag([...samples, after.metrics])
    if (lag) delta.eventLoopLag = lag
  }

  if (!before.probe || !after.probe) {
    warnings.push('the database probe was not reachable; statement and row counts are missing')
    return delta
  }

  for (const [name, afterEngine] of Object.entries(after.probe.engines)) {
    const engine = diffEngine(name, before.probe.engines[name], afterEngine, warnings)
    if (!engine) continue
    delta.engines[name] = engine

    const statements = diffEngineStatements(
      name,
      before.probe.engines[name],
      afterEngine,
      top,
      warnings,
    )
    if (statements?.length) delta.topStatements[name] = statements
  }

  return delta
}

function diffEngineStatements(
  name: string,
  before: EngineSnapshot | undefined,
  after: EngineSnapshot,
  top: number,
  warnings: string[],
): StatementStats[] | undefined {
  if (after.allStatements && before?.allStatements) {
    return diffStatements(before.allStatements, after.allStatements, top)
  }
  if (after.allStatements || after.topStatements?.length) {
    warnings.push(
      `${name}: no statements table, because only a probe read with ?statements=all at both ends shows what the run cost each statement`,
    )
  }
  return undefined
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

/**
 * What each statement cost between two cumulative lists, most expensive first.
 * A statement whose counters went backwards had its statistics reset, and one
 * with no new calls did nothing in the run; both are left out.
 */
export function diffStatements(
  before: StatementStats[],
  after: StatementStats[],
  top = 10,
): StatementStats[] {
  const identify = (statement: StatementStats) => statement.key ?? statement.query
  const earlier = new Map(before.map((statement) => [identify(statement), statement]))

  const changed: StatementStats[] = []
  for (const statement of after) {
    const previous = earlier.get(identify(statement))
    const calls = statement.calls - (previous?.calls ?? 0)
    const totalMs = statement.totalMs - (previous?.totalMs ?? 0)
    if (calls > 0 && totalMs >= 0) changed.push({ ...statement, calls, totalMs })
  }
  return changed.sort((a, b) => b.totalMs - a.totalMs).slice(0, top)
}

/** One p99 per scrape, so the worst and the median interval, and the highest max. */
export function summarizeEventLoopLag(samples: ProcessMetrics[]): EventLoopLag | undefined {
  const p99s = samples
    .map((sample) => sample.eventLoopLagP99Seconds)
    .filter((value) => value !== undefined)
    .sort((a, b) => a - b)
  const worst = p99s.at(-1)
  if (worst === undefined) return undefined

  const middle = Math.floor(p99s.length / 2)
  const median =
    p99s.length % 2 === 1
      ? (p99s[middle] ?? worst)
      : ((p99s[middle - 1] ?? worst) + (p99s[middle] ?? worst)) / 2
  const maxes = samples
    .map((sample) => sample.eventLoopLagMaxSeconds)
    .filter((value) => value !== undefined)

  return {
    intervals: p99s.length,
    p99WorstSeconds: worst,
    p99MedianSeconds: median,
    ...(maxes.length ? { maxSeconds: Math.max(...maxes) } : {}),
  }
}

function subtract(after: number | undefined, before: number | undefined): number | undefined {
  if (after === undefined || before === undefined) return undefined
  // A restart mid-run resets a counter, and a negative delta would be a wrong
  // number in the report. Say nothing instead.
  return after >= before ? after - before : undefined
}

export function formatResourcesSection(delta: ResourceDelta): string {
  const lines = ['## Resources', '', '| Measure | Value |', '|---|---|']
  const row = (label: string, value: string | undefined) => {
    if (value !== undefined) lines.push(`| ${label} | ${value} |`)
  }

  row(
    'CPU seconds',
    format(delta.cpuSeconds, (value) => value.toFixed(2)),
  )
  row(
    'GC seconds',
    format(delta.gcSeconds, (value) => value.toFixed(2)),
  )
  row('Resident memory at end', format(delta.residentBytesAtEnd, formatMiB))
  row('Heap used at end', format(delta.heapUsedBytesAtEnd, formatMiB))
  const lag = delta.eventLoopLag
  row('Event loop lag p99, worst interval', format(lag?.p99WorstSeconds, formatMs))
  row('Event loop lag p99, median interval', format(lag?.p99MedianSeconds, formatMs))
  row('Event loop lag max', format(lag?.maxSeconds, formatMs))
  row('Event loop lag intervals', format(lag?.intervals, formatCount))
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
const formatMs = (seconds: number) => `${(seconds * 1000).toFixed(1)} ms`

export type ScrapeResourcesOptions = {
  /** The service's Prometheus endpoint. */
  metricsUrl?: string
  /** The database probe's `/db-stats`, with `?statements=all` for a statements table. */
  probeUrl?: string
}

/** One scrape of the metrics endpoint, or `undefined` when it did not answer. */
export async function scrapeMetrics(metricsUrl: string): Promise<ProcessMetrics | undefined> {
  const text = await fetchText(metricsUrl)
  return text === undefined ? undefined : parseProcessMetrics(text)
}

/** One scrape of both sources. Either half is `undefined` when it did not answer. */
export async function scrapeResources(options: ScrapeResourcesOptions): Promise<ResourceSnapshot> {
  const [metrics, probe] = await Promise.all([
    options.metricsUrl ? scrapeMetrics(options.metricsUrl) : undefined,
    options.probeUrl ? fetchJson<ProbeSnapshot>(options.probeUrl) : undefined,
  ])
  return { metrics, probe }
}

export type MeasureResourcesOptions = {
  /**
   * Read every `sampleIntervalMs` while `body` runs, for event loop lag, which
   * only means something while the load is on. Usually
   * `() => scrapeMetrics(metricsUrl)`.
   */
  sampleMetrics?: () => Promise<ProcessMetrics | undefined>
  /** @default 5000 */
  sampleIntervalMs?: number
  /** Rows per statements table. @default 10 */
  top?: number
}

/**
 * Scrapes before and after `body`, samples the metrics in between when asked
 * to, and returns what `body` returned with the difference.
 */
export async function measureResources<T>(
  scrape: () => Promise<ResourceSnapshot>,
  body: () => Promise<T>,
  options: MeasureResourcesOptions = {},
): Promise<{ result: T; delta: ResourceDelta }> {
  const before = await scrape()
  const sampler = options.sampleMetrics
    ? startSampling(options.sampleMetrics, options.sampleIntervalMs ?? 5000)
    : undefined
  let result: T
  try {
    result = await body()
  } finally {
    sampler?.stop()
  }
  // Awaited before the closing scrape, so a sample in flight cannot land after it.
  const samples = (await sampler?.settled()) ?? []
  const after = await scrape()
  return { result, delta: diffResources(before, after, { samples, top: options.top }) }
}

function startSampling(sample: () => Promise<ProcessMetrics | undefined>, intervalMs: number) {
  const samples: ProcessMetrics[] = []
  let inFlight: Promise<void> | undefined
  const timer = setInterval(() => {
    if (inFlight) return
    inFlight = sample()
      .then(
        (metrics) => {
          if (metrics) samples.push(metrics)
        },
        () => undefined,
      )
      .finally(() => {
        inFlight = undefined
      })
  }, intervalMs)

  return {
    stop: () => clearInterval(timer),
    settled: async () => {
      await inFlight
      return samples
    },
  }
}
