import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { fetchJson, fetchText } from './http.ts'
import {
  diffResources,
  formatResourcesSection,
  measureResources,
  parseProcessMetrics,
  type ResourceSnapshot,
  scrapeResources,
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
broken_line
not_a_number NaNish
`

describe('parseProcessMetrics', () => {
  it('reads the five samples and sums GC across collector kinds', () => {
    expect(parseProcessMetrics(EXPOSITION)).toEqual({
      cpuSeconds: 12.5,
      residentBytes: 104857600,
      heapUsedBytes: 52428800,
      gcSeconds: 1,
      eventLoopLagP99Seconds: 0.012,
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
        Postgres: engine({ statements: 100, rowsReturned: 1000, rowsWritten: 10 }),
        CockroachDB: engine({ statements: 5, rowsReturned: 50 }),
      },
    },
  }

  it('reports counters as differences and gauges as their end value', () => {
    const top = [{ query: 'SELECT 1', calls: 3, totalMs: 4.5 }]
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
            topStatements: top,
          }),
          CockroachDB: engine({ statements: 7, rowsReturned: 80, topStatements: [] }),
        },
      },
    })

    expect(delta).toEqual({
      cpuSeconds: 2.5,
      gcSeconds: 0.5,
      residentBytesAtEnd: 2,
      heapUsedBytesAtEnd: 3,
      eventLoopLagP99SecondsAtEnd: 0.01,
      engines: {
        Postgres: { statements: 50, rowsReturned: 600, rowsWritten: 20 },
        CockroachDB: { statements: 2, rowsReturned: 30 },
      },
      topStatements: { Postgres: top },
      warnings: [],
    })
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

describe('formatResourcesSection', () => {
  it('prints what was measured, per engine, and nothing for what was not', () => {
    const section = formatResourcesSection({
      cpuSeconds: 2.5,
      residentBytesAtEnd: 104857600,
      eventLoopLagP99SecondsAtEnd: 0.0123,
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
        '| Event loop lag p99 at end | 12.3 ms |',
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
})
