import type { AddressInfo } from 'node:net'
import type { Sql } from 'postgres'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createDbProbeServer,
  normalizeStatement,
  PROBE_APPLICATION_NAME,
  PROBE_QUERY_MARKER,
  type ProbeSnapshot,
  parseTop,
  readCockroachStats,
  readPostgresStats,
} from './index.ts'

type Row = Record<string, unknown>
type Call = { text: string; values: unknown[] }

/**
 * A postgres.js tagged template that answers by matching the SQL text, and
 * records what it was asked.
 */
function fakeSql(answer: (text: string) => Row[]): { sql: Sql; calls: Call[] } {
  const calls: Call[] = []
  const tag = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?')
    calls.push({ text, values })
    return Promise.resolve(answer(text))
  }
  return { sql: tag as unknown as Sql, calls }
}

describe('normalizeStatement', () => {
  it('collapses whitespace and truncates long statements', () => {
    expect(normalizeStatement('  SELECT\n  1\t FROM x ')).toBe('SELECT 1 FROM x')
    expect(normalizeStatement('abcdefgh', 5)).toBe('abcd…')
    expect(normalizeStatement('abcde', 5)).toBe('abcde')
  })
})

describe('parseTop', () => {
  it('accepts a positive integer, clamped, and is 0 for anything else', () => {
    expect(parseTop(null)).toBe(0)
    expect(parseTop('10')).toBe(10)
    expect(parseTop('500')).toBe(50)
    expect(parseTop('500', 100)).toBe(100)
    expect(parseTop('0')).toBe(0)
    expect(parseTop('-3')).toBe(0)
    expect(parseTop('2.5')).toBe(0)
    expect(parseTop('ten')).toBe(0)
  })
})

describe('readPostgresStats', () => {
  const database = { xact_commit: '40', tup_returned: '400', written: '12' }

  it('reads pg_stat_statements and the writes from pg_stat_database', async () => {
    const { sql, calls } = fakeSql((text) => {
      if (text.includes('FROM pg_extension')) return [{ present: 1 }]
      if (text.includes('FROM pg_stat_database')) return [database]
      if (text.includes('SUM(calls)')) return [{ calls: '90', rows: '900' }]
      if (text.includes('ORDER BY total_exec_time'))
        return [{ query: 'SELECT\n  $1', calls: '3', total_ms: '1.5' }]
      return []
    })

    await expect(readPostgresStats(sql, 5)).resolves.toEqual({
      available: true,
      statements: 90,
      rowsReturned: 900,
      rowsWritten: 12,
      topStatements: [{ query: 'SELECT $1', calls: 3, totalMs: 1.5 }],
    })
    expect(calls.at(-1)?.values).toEqual([`${PROBE_QUERY_MARKER}%`, 5])
  })

  it('marks every query it sends and leaves marked statements out of the totals', async () => {
    const { sql, calls } = fakeSql((text) => (text.includes('FROM pg_extension') ? [{}] : []))
    await readPostgresStats(sql, 5)

    expect(calls).toHaveLength(4)
    for (const { text } of calls) expect(text.trim().startsWith(PROBE_QUERY_MARKER)).toBe(true)
    const fromStatements = calls.filter(({ text }) => text.includes('FROM pg_stat_statements'))
    expect(fromStatements).toHaveLength(2)
    for (const { text, values } of fromStatements) {
      expect(text).toContain('query NOT LIKE ?')
      expect(values[0]).toBe(`${PROBE_QUERY_MARKER}%`)
    }
  })

  it('skips the statements table when top is 0, and tolerates empty results', async () => {
    const { sql, calls } = fakeSql((text) => (text.includes('FROM pg_extension') ? [{}] : []))
    await expect(readPostgresStats(sql)).resolves.toEqual({
      available: true,
      statements: 0,
      rowsReturned: 0,
      rowsWritten: 0,
    })
    expect(calls.some(({ text }) => text.includes('ORDER BY'))).toBe(false)
  })

  it('falls back to committed transactions without the extension, and says so', async () => {
    const { sql } = fakeSql((text) => (text.includes('FROM pg_stat_database') ? [database] : []))
    await expect(readPostgresStats(sql, 5)).resolves.toEqual({
      available: true,
      reason: 'pg_stat_statements is not installed; counting committed transactions instead',
      statements: 40,
      rowsReturned: 400,
      rowsWritten: 12,
    })
  })

  it('falls back to committed transactions when the extension exists but is not preloaded', async () => {
    const { sql } = fakeSql((text) => {
      if (text.includes('FROM pg_extension')) return [{ present: 1 }]
      if (text.includes('FROM pg_stat_database')) return [database]
      throw new Error('pg_stat_statements must be loaded via "shared_preload_libraries"')
    })
    await expect(readPostgresStats(sql, 5)).resolves.toEqual({
      available: true,
      reason:
        'pg_stat_statements is not readable (pg_stat_statements must be loaded via "shared_preload_libraries"); counting committed transactions instead',
      statements: 40,
      rowsReturned: 400,
      rowsWritten: 12,
    })
  })

  it('reports zeros when even pg_stat_database returns nothing', async () => {
    const { sql } = fakeSql(() => [])
    await expect(readPostgresStats(sql)).resolves.toMatchObject({
      statements: 0,
      rowsReturned: 0,
      rowsWritten: 0,
    })
  })
})

describe('readCockroachStats', () => {
  it('sums the statement statistics without a write counter, excluding its own session', async () => {
    const { sql, calls } = fakeSql((text) => {
      if (text.includes('SUM(count)')) return [{ calls: '20', rows: '99.6' }]
      return [{ query: 'SELECT  *  FROM t', count: '4', service_lat_avg: '0.002' }]
    })

    const stats = await readCockroachStats(sql, { top: 3, probeApplicationName: 'mine' })

    expect(stats).toEqual({
      available: true,
      statements: 20,
      rowsReturned: 100,
      topStatements: [{ query: 'SELECT * FROM t', calls: 4, totalMs: 8 }],
    })
    expect(calls[0]?.values).toEqual(['$ internal%', 'mine'])
    expect(calls[1]?.values).toEqual(['$ internal%', 'mine', 3])
  })

  it('defaults to no statements table and the default application name', async () => {
    const { sql, calls } = fakeSql(() => [])
    await expect(readCockroachStats(sql)).resolves.toEqual({
      available: true,
      statements: 0,
      rowsReturned: 0,
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.values).toEqual(['$ internal%', PROBE_APPLICATION_NAME])
  })
})

describe('createDbProbeServer', () => {
  const servers: ReturnType<typeof createDbProbeServer>[] = []

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))))
  })

  async function start(options: Parameters<typeof createDbProbeServer>[0]) {
    const server = createDbProbeServer(options)
    servers.push(server)
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  }

  it('answers health, 404s anything else, and reports every engine with the clamped top', async () => {
    const tops: number[] = []
    const base = await start({
      engines: {
        Postgres: (top) => {
          tops.push(top)
          return Promise.resolve({ available: true, statements: 1, rowsReturned: 2 })
        },
        CockroachDB: () => Promise.reject(new Error('connection refused')),
      },
      maxTop: 5,
    })

    const health = await fetch(`${base}/health`)
    expect(health.status).toBe(200)
    await expect(health.json()).resolves.toEqual({ status: 'ok' })

    expect((await fetch(`${base}/elsewhere`)).status).toBe(404)

    const stats = (await (await fetch(`${base}/db-stats?top=10`)).json()) as ProbeSnapshot
    expect(tops).toEqual([5])
    expect(stats).toEqual({
      at: expect.any(String),
      engines: {
        Postgres: { available: true, statements: 1, rowsReturned: 2 },
        CockroachDB: {
          available: false,
          reason: 'Error: connection refused',
          statements: 0,
          rowsReturned: 0,
        },
      },
    })
    expect(Object.keys(stats.engines)).toEqual(['Postgres', 'CockroachDB'])
  })

  it('reports an engine whose reader throws before returning a promise as unavailable', async () => {
    const base = await start({
      engines: {
        Postgres: () => {
          throw new Error('no connection')
        },
      },
    })
    const stats = (await (await fetch(`${base}/db-stats`)).json()) as ProbeSnapshot
    expect(stats.engines.Postgres).toMatchObject({
      available: false,
      reason: 'Error: no connection',
    })
  })

  it('defaults top to 0 and clamps at 50', async () => {
    const tops: number[] = []
    const base = await start({
      engines: {
        Postgres: (top) => {
          tops.push(top)
          return Promise.resolve({ available: true, statements: 0, rowsReturned: 0 })
        },
      },
    })
    await fetch(`${base}/db-stats`)
    await fetch(`${base}/db-stats?top=80`)
    expect(tops).toEqual([0, 50])
  })
})
