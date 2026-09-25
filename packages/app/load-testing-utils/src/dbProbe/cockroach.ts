import type { Sql } from 'postgres'
import type { EngineSnapshot, StatementStats } from '../types.ts'
import { normalizeStatement } from './statements.ts'

/** The `application_name` a probe connection should set, so its own queries are left out. */
export const PROBE_APPLICATION_NAME = 'perf-probe'

/** Cockroach's own jobs and changefeeds run under application names matching this. */
const INTERNAL_APPLICATIONS = '$ internal%'

export type CockroachStatsOptions = {
  /** @default 0, no statements table */
  top?: number
  /** Must match the connection's `application_name`. @default {@link PROBE_APPLICATION_NAME} */
  probeApplicationName?: string
}

/**
 * CockroachDB counters, from `crdb_internal.statement_statistics`: the node's
 * in-memory statistics together with what it has flushed to
 * `system.statement_statistics`. No extension to install.
 *
 * Not `node_statement_statistics`, which is the in-memory half alone: every
 * `sql.stats.flush.interval` (10 minutes by default) the node flushes it and
 * starts it from zero, so a difference across a flush would come out wrong.
 *
 * From v26.1 cockroach refuses `crdb_internal` reads unless the session sets
 * `allow_unsafe_internals`, so create the connection with
 * `connection: { allow_unsafe_internals: 'true', application_name: PROBE_APPLICATION_NAME }`.
 *
 * Cockroach keeps a mean per statement and no total, so totals are the mean
 * times the count: right in aggregate, not to the unit. `rowsWritten` is absent.
 */
export async function readCockroachStats(
  sql: Sql,
  options: CockroachStatsOptions = {},
): Promise<EngineSnapshot> {
  const { top = 0, probeApplicationName = PROBE_APPLICATION_NAME } = options

  const [totals] = await sql`
    SELECT COALESCE(SUM((statistics->'statistics'->>'cnt')::FLOAT8), 0) AS calls,
           COALESCE(SUM((statistics->'statistics'->'numRows'->>'mean')::FLOAT8
             * (statistics->'statistics'->>'cnt')::FLOAT8), 0) AS rows
    FROM crdb_internal.statement_statistics
    WHERE app_name NOT LIKE ${INTERNAL_APPLICATIONS}
      AND app_name <> ${probeApplicationName}
  `
  return {
    available: true,
    statements: Math.round(Number(totals?.calls ?? 0)),
    rowsReturned: Math.round(Number(totals?.rows ?? 0)),
    ...(top > 0 ? { topStatements: await readCockroachTop(sql, top, probeApplicationName) } : {}),
  }
}

async function readCockroachTop(
  sql: Sql,
  top: number,
  probeApplicationName: string,
): Promise<StatementStats[]> {
  // Upstream keeps a row per fingerprint, hour, plan and app; a report wants one per fingerprint.
  // svcLat is in seconds.
  const rows = await sql`
    SELECT encode(fingerprint_id, 'hex') AS key, MIN(metadata->>'query') AS query,
           SUM((statistics->'statistics'->>'cnt')::FLOAT8) AS calls,
           SUM((statistics->'statistics'->'svcLat'->>'mean')::FLOAT8
             * (statistics->'statistics'->>'cnt')::FLOAT8) * 1000 AS total_ms
    FROM crdb_internal.statement_statistics
    WHERE app_name NOT LIKE ${INTERNAL_APPLICATIONS}
      AND app_name <> ${probeApplicationName}
    GROUP BY fingerprint_id
    ORDER BY total_ms DESC
    LIMIT ${top}
  `
  return rows.map((row) => ({
    key: String(row.key),
    query: normalizeStatement(String(row.query)),
    calls: Math.round(Number(row.calls)),
    totalMs: Number(row.total_ms),
  }))
}
