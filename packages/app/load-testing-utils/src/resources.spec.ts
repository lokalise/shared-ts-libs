import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { fetchJson, fetchText } from './http.ts'
import {
  diffResources,
  diffStatements,
  formatResourcesSection,
  measureResources,
  type ProcessMetrics,
  parseProcessMetrics,
  type ResourceSnapshot,
  scrapeMetrics,
  scrapeResources,
  summarizeEventLoopLag,
} from './resources.ts'
import type { EngineSnapshot } from './types.ts'

const EXPOSITION = `
# HELP process_cpu_seconds_total Total user and system CPU time spent in seconds.
# TYPE process_cpu_seconds_total counter
process_cpu_seconds_total 12.5
process_resident_memory_bytes 104857600 1700000000000
nodejs_heap_size_used_bytes 52428800
nodejs_gc_duration_seconds_sum{kind="minor"} 0.25
nodejs_gc_duration_seconds_sum{kind="major", note="a b"} 0.75
nodejs_gc_duration_seconds_count{kind="minor"} 10
nodejs_eventloop_lag_p99_seconds 0.012
nodejs_eventloop_lag_max_seconds 0.3
broken_line
not_a_number NaNish
`

describe('parseProcessMetrics', () => {
  it('reads the six samples and sums GC across collector kinds', () => {
    expect(parseProcessMetrics(EXPOSITION)).toEqual({
      cpuSeconds: 12.5,
      residentBytes: 104857600,
      heapUsedBytes: 52428800,
      gcSeconds: 1,
      eventLoopLagP99Seconds: 0.012,
      eventLoopLagMaxSeconds: 0.3,
    })
  })

  it('returns nothing for an exposition without them', () => {
    expect(parseProcessMetrics('')).toEqual({})
  })
})

const engine = (overrides: Partial<EngineSnapshot> = {}): EngineSnapshot => ({
  available: true,
  statements: 0,
  rowsReturned: 0,
  ...overrides,
})

describe('diffResources', () => {
  const before: ResourceSnapshot = {
    metrics: { cpuSeconds: 10, gcSeconds: 1, residentBytes: 1 },
    probe: {
      at: 't0',
      engines: {
        Postgres: engine({
          statements: 100,
          rowsReturned: 1000,
          rowsWritten: 10,
          allStatements: [{ key: 'q1', query: 'SELECT 1', calls: 97, totalMs: 500 }],
        }),
        CockroachDB: engine({ statements: 5, rowsReturned: 50, allStatements: [] }),
      },
    },
  }

  it('reports counters as differences and gauges as their end value', () => {
    const delta = diffResources(before, {
      metrics: {
        cpuSeconds: 12.5,
        gcSeconds: 1.5,
        residentBytes: 2,
        heapUsedBytes: 3,
        eventLoopLagP99Seconds: 0.01,
      },
      probe: {
        at: 't1',
        engines: {
          Postgres: engine({
            statements: 150,
            rowsReturned: 1600,
            rowsWritten: 30,
            allStatements: [{ key: 'q1', query: 'SELECT 1', calls: 100, totalMs: 504.5 }],
          }),
          CockroachDB: engine({ statements: 7, rowsReturned: 80, allStatements: [] }),
        },
      },
    })

    expect(delta).toEqual({
      cpuSeconds: 2.5,
      gcSeconds: 0.5,
      residentBytesAtEnd: 2,
      heapUsedBytesAtEnd: 3,
      eventLoopLag: { intervals: 1, p99WorstSeconds: 0.01, p99MedianSeconds: 0.01 },
      engines: {
        Postgres: { statements: 50, rowsReturned: 600, rowsWritten: 20 },
        CockroachDB: { statements: 2, rowsReturned: 30 },
      },
      topStatements: { Postgres: [{ key: 'q1', query: 'SELECT 1', calls: 3, totalMs: 4.5 }] },
      warnings: [],
    })
  })

  it('summarises event loop lag over the samples and the closing scrape', () => {
    const delta = diffResources(
      before,
      { ...before, metrics: { eventLoopLagP99Seconds: 0.02, eventLoopLagMaxSeconds: 0.03 } },
      {
        samples: [
          { eventLoopLagP99Seconds: 0.5, eventLoopLagMaxSeconds: 0.9 },
          { eventLoopLagP99Seconds: 0.04 },
        ],
      },
    )
    expect(delta.eventLoopLag).toEqual({
      intervals: 3,
      p99WorstSeconds: 0.5,
      p99MedianSeconds: 0.04,
      maxSeconds: 0.9,
    })
  })

  it('leaves the statements table out, with a warning, unless both ends listed every statement', () => {
    const cumulative = [{ query: 'SELECT 1', calls: 3, totalMs: 4.5 }]
    const delta = diffResources(
      {
        probe: {
          at: 't0',
          engines: {
            Postgres: engine({ topStatements: cumulative }),
            CockroachDB: engine(),
          },
        },
      },
      {
        probe: {
          at: 't1',
          engines: {
            Postgres: engine({ topStatements: cumulative }),
            CockroachDB: engine({ allStatements: cumulative }),
          },
        },
      },
    )
    expect(delta.topStatements).toEqual({})
    expect(delta.warnings.slice(1)).toEqual([
      'Postgres: no statements table, because only a probe read with ?statements=all at both ends shows what the run cost each statement',
      'CockroachDB: no statements table, because only a probe read with ?statements=all at both ends shows what the run cost each statement',
    ])
  })

  it('drops a counter that went backwards, since that means a restart', () => {
    const delta = diffResources(before, { ...before, metrics: { cpuSeconds: 3, gcSeconds: 2 } })
    expect(delta.cpuSeconds).toBeUndefined()
    expect(delta.gcSeconds).toBe(1)
  })

  it('drops an engine whose statistics were reset mid-run, instead of printing negative counts', () => {
    const delta = diffResources(before, {
      ...before,
      probe: {
        at: 't1',
        engines: {
          Postgres: engine({ statements: 20, rowsReturned: 1200, rowsWritten: 15 }),
          CockroachDB: engine({ statements: 9, rowsReturned: 60 }),
        },
      },
    })
    expect(delta.engines).toEqual({ CockroachDB: { statements: 4, rowsReturned: 10 } })
    expect(delta.warnings).toEqual(['Postgres: its statistics were reset during the run'])
  })

  it('warns about each missing source instead of reporting zeros', () => {
    expect(diffResources({}, {}).warnings).toEqual([
      'service metrics were not scraped; CPU, memory and GC are missing',
      'the database probe was not reachable; statement and row counts are missing',
    ])
  })

  it('warns about an unavailable engine and carries a caveat beside the numbers', () => {
    const delta = diffResources(
      {
        probe: {
          at: 't0',
          engines: {
            Postgres: engine({ statements: 1, reason: 'counting transactions' }),
            CockroachDB: engine({ available: false }),
          },
        },
      },
      {
        probe: {
          at: 't1',
          engines: {
            Postgres: engine({ statements: 4, reason: 'counting transactions' }),
            CockroachDB: engine({ available: false, reason: 'connection refused' }),
            Added: engine(),
          },
        },
      },
    )

    expect(delta.engines).toEqual({ Postgres: { statements: 3, rowsReturned: 0 } })
    expect(delta.warnings).toEqual([
      'service metrics were not scraped; CPU, memory and GC are missing',
      'Postgres: counting transactions',
      'CockroachDB: connection refused',
      'Added: unavailable',
    ])
  })
})

describe('diffStatements', () => {
  it('ranks what each statement cost between the two lists, not what it has cost ever', () => {
    const before = [
      { key: 'migration', query: 'CREATE TABLE t', calls: 1, totalMs: 900 },
      { key: 'read', query: 'SELECT t', calls: 10, totalMs: 5 },
      { key: 'reset', query: 'UPDATE t', calls: 50, totalMs: 50 },
    ]
    const after = [
      { key: 'migration', query: 'CREATE TABLE t', calls: 1, totalMs: 900 },
      { key: 'read', query: 'SELECT t', calls: 110, totalMs: 205 },
      { key: 'reset', query: 'UPDATE t', calls: 2, totalMs: 1 },
      { key: 'new', query: 'DELETE t', calls: 4, totalMs: 40 },
      { query: 'no key', calls: 1, totalMs: 1 },
    ]

    expect(diffStatements(before, after)).toEqual([
      { key: 'read', query: 'SELECT t', calls: 100, totalMs: 200 },
      { key: 'new', query: 'DELETE t', calls: 4, totalMs: 40 },
      { query: 'no key', calls: 1, totalMs: 1 },
    ])
    expect(diffStatements(before, after, 1)).toHaveLength(1)
  })

  it('matches by query text when a statement has no key', () => {
    const statement = { query: 'SELECT 1', calls: 2, totalMs: 2 }
    expect(diffStatements([statement], [{ ...statement, calls: 5, totalMs: 8 }])).toEqual([
      { query: 'SELECT 1', calls: 3, totalMs: 6 },
    ])
  })
})

describe('summarizeEventLoopLag', () => {
  it('averages the two middle intervals for an even count, and is undefined without a p99', () => {
    const samples: ProcessMetrics[] = [0.01, 0.4, 0.02, 0.03].map((p99) => ({
      eventLoopLagP99Seconds: p99,
    }))
    expect(summarizeEventLoopLag(samples)).toEqual({
      intervals: 4,
      p99WorstSeconds: 0.4,
      p99MedianSeconds: 0.025,
    })
    expect(summarizeEventLoopLag([{ cpuSeconds: 1 }])).toBeUndefined()
  })
})

describe('formatResourcesSection', () => {
  it('prints what was measured, per engine, and nothing for what was not', () => {
    const section = formatResourcesSection({
      cpuSeconds: 2.5,
      residentBytesAtEnd: 104857600,
      eventLoopLag: {
        intervals: 36,
        p99WorstSeconds: 0.0823,
        p99MedianSeconds: 0.0123,
        maxSeconds: 0.25,
      },
      engines: {
        Postgres: { statements: 12345, rowsReturned: 10, rowsWritten: 2 },
        CockroachDB: { statements: 7, rowsReturned: 0 },
      },
      topStatements: {
        Postgres: [{ query: 'SELECT a | b', calls: 1500, totalMs: 12.345 }],
      },
      warnings: ['CockroachDB: slow'],
    })

    expect(section).toBe(
      [
        '## Resources',
        '',
        '| Measure | Value |',
        '|---|---|',
        '| CPU seconds | 2.50 |',
        '| Resident memory at end | 100.0 MiB |',
        '| Event loop lag p99, worst interval | 82.3 ms |',
        '| Event loop lag p99, median interval | 12.3 ms |',
        '| Event loop lag max | 250.0 ms |',
        '| Event loop lag intervals | 36 |',
        '| Postgres statements | 12,345 |',
        '| Postgres rows returned | 10 |',
        '| Postgres rows written | 2 |',
        '| CockroachDB statements | 7 |',
        '| CockroachDB rows returned | 0 |',
        '',
        '### Postgres statements by database time',
        '',
        '| Statement | Calls | Total ms |',
        '|---|---|---|',
        '| `SELECT a \\| b` | 1,500 | 12.3 |',
        '',
        '> CockroachDB: slow',
        '',
      ].join('\n'),
    )
  })

  it('prints GC and heap when present', () => {
    const section = formatResourcesSection({
      gcSeconds: 0.5,
      heapUsedBytesAtEnd: 1048576,
      engines: {},
      topStatements: {},
      warnings: [],
    })
    expect(section).toContain('| GC seconds | 0.50 |')
    expect(section).toContain('| Heap used at end | 1.0 MiB |')
  })
})

const servers: Server[] = []

async function serve(routes: Record<string, [number, string]>): Promise<string> {
  const server = createServer((request, response) => {
    const [status, body] = routes[request.url ?? ''] ?? [404, '']
    response.writeHead(status)
    response.end(body)
  })
  servers.push(server)
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))))
})

describe('fetchText and fetchJson', () => {
  it('return undefined for a non-2xx, a refused connection or a body that is not JSON', async () => {
    const base = await serve({ '/ok': [200, '{"a":1}'], '/text': [200, 'nope'] })
    await expect(fetchText(`${base}/ok`)).resolves.toBe('{"a":1}')
    await expect(fetchJson(`${base}/ok`)).resolves.toEqual({ a: 1 })
    await expect(fetchJson(`${base}/text`)).resolves.toBeUndefined()
    await expect(fetchJson(`${base}/missing`)).resolves.toBeUndefined()
    await expect(fetchText('http://127.0.0.1:1/')).resolves.toBeUndefined()
  })
})

describe('scrapeResources and measureResources', () => {
  it('scrapes both sources, and brackets a body with two scrapes', async () => {
    const probe = { at: 't', engines: { Postgres: engine({ statements: 1 }) } }
    const base = await serve({
      '/metrics': [200, 'process_cpu_seconds_total 1'],
      '/db-stats': [200, JSON.stringify(probe)],
    })

    await expect(
      scrapeResources({ metricsUrl: `${base}/metrics`, probeUrl: `${base}/db-stats` }),
    ).resolves.toEqual({ metrics: { cpuSeconds: 1 }, probe })
    await expect(
      scrapeResources({ metricsUrl: `${base}/missing`, probeUrl: `${base}/missing` }),
    ).resolves.toEqual({ metrics: undefined, probe: undefined })
    await expect(scrapeResources({})).resolves.toEqual({ metrics: undefined, probe: undefined })

    let cpu = 1
    const { result, delta } = await measureResources(
      () => Promise.resolve({ metrics: { cpuSeconds: cpu } }),
      () => {
        cpu = 4
        return Promise.resolve('done')
      },
    )
    expect(result).toBe('done')
    expect(delta.cpuSeconds).toBe(3)
  })

  it('reads metrics from a URL, or undefined when nothing answers', async () => {
    const base = await serve({ '/metrics': [200, 'nodejs_eventloop_lag_p99_seconds 0.5'] })
    await expect(scrapeMetrics(`${base}/metrics`)).resolves.toEqual({ eventLoopLagP99Seconds: 0.5 })
    await expect(scrapeMetrics(`${base}/missing`)).resolves.toBeUndefined()
  })
})

describe('measureResources sampling', () => {
  it('samples while the body runs, skipping empty and failed samples, and stops before the closing scrape', async () => {
    const answers: (() => Promise<ProcessMetrics | undefined>)[] = [
      () => Promise.resolve({ eventLoopLagP99Seconds: 0.2 }),
      () => Promise.resolve(undefined),
      () => Promise.reject(new Error('refused')),
      () => Promise.resolve({ eventLoopLagP99Seconds: 0.1 }),
    ]
    let calls = 0
    let bodyDone: () => void = () => undefined
    const bodyFinished = new Promise<void>((resolve) => {
      bodyDone = resolve
    })
    const sampleMetrics = () => {
      const answer = answers[calls++] ?? (() => Promise.resolve(undefined))
      if (calls === answers.length) bodyDone()
      return answer()
    }
    let sampledAtClose = -1

    const { delta } = await measureResources(
      () => {
        sampledAtClose = calls
        return Promise.resolve({ metrics: { eventLoopLagP99Seconds: 0.05 } })
      },
      () => bodyFinished,
      { sampleMetrics, sampleIntervalMs: 1 },
    )

    expect(sampledAtClose).toBe(answers.length)
    expect(delta.eventLoopLag).toEqual({
      intervals: 3,
      p99WorstSeconds: 0.2,
      p99MedianSeconds: 0.1,
    })
  })

  it('stops sampling when the body throws', async () => {
    let calls = 0
    const sampleMetrics = () => {
      calls++
      return Promise.resolve(undefined)
    }
    await expect(
      measureResources(
        () => Promise.resolve({}),
        () => Promise.reject(new Error('k6 failed')),
        { sampleMetrics, sampleIntervalMs: 1 },
      ),
    ).rejects.toThrow('k6 failed')
    const afterThrow = calls
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(calls).toBe(afterThrow)
  })
})
