import { createServer, type Server, type ServerResponse } from 'node:http'
import type { EngineSnapshot, ProbeSnapshot } from '../types.ts'
import { parseTop, unavailable } from './statements.ts'

/** Reads one engine's counters, with a statements table of `top` rows when `top` is above 0. */
export type EngineReader = (top: number) => Promise<EngineSnapshot>

export type DbProbeServerOptions = {
  /** Keyed by the name a report prints, in the order it prints them. */
  engines: Record<string, EngineReader>
  /** Upper bound on `?top=`. @default 50 */
  maxTop?: number
  /** How many statements `?statements=all` reads at most. @default 5000, `pg_stat_statements.max` */
  maxStatements?: number
}

const json = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

/**
 * An HTTP server reporting what the databases did, for a load-test runner to
 * read before and after a k6 run. A route rather than a connection because k6
 * has no database client without a custom binary.
 *
 *   GET /health                  200
 *   GET /db-stats                a {@link ProbeSnapshot}
 *   GET /db-stats?top=10         plus each engine's most expensive statements
 *   GET /db-stats?statements=all plus every statement, for a report to diff
 *
 * An engine that throws is reported as unavailable with the error as its
 * reason, so one missing database does not cost the report the other.
 *
 * Returned unstarted: call `listen` on it.
 */
export function createDbProbeServer(options: DbProbeServerOptions): Server {
  const { engines, maxTop = 50, maxStatements = 5000 } = options

  return createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')

    if (url.pathname === '/health') {
      json(response, 200, { status: 'ok' })
      return
    }
    if (url.pathname !== '/db-stats') {
      json(response, 404, { error: 'not found' })
      return
    }

    const top = parseTop(url.searchParams.get('top'), maxTop)
    const all = url.searchParams.get('statements') === 'all'
    // One read serves both: the full list is already ranked, so the top N is its head.
    const readEngine = async (read: EngineReader): Promise<EngineSnapshot> => {
      if (!all) return await read(top)
      const { topStatements = [], ...counters } = await read(maxStatements)
      return {
        ...counters,
        ...(top > 0 ? { topStatements: topStatements.slice(0, top) } : {}),
        allStatements: topStatements,
        ...(topStatements.length >= maxStatements ? { allStatementsTruncated: true } : {}),
      }
    }

    void Promise.all(
      // try rather than `.catch`, which misses a reader that throws before returning a promise.
      Object.entries(engines).map(async ([name, read]) => {
        try {
          return [name, await readEngine(read)] as const
        } catch (error) {
          return [name, unavailable(String(error))] as const
        }
      }),
    ).then((entries) => {
      const snapshot: ProbeSnapshot = {
        at: new Date().toISOString(),
        engines: Object.fromEntries(entries),
      }
      json(response, 200, snapshot)
    })
  })
}
