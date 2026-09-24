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
 * CockroachDB counters, from the in-memory statement statistics of the node the
 * connection landed on. No extension to install, and reset by a node restart.
 *
 * From v26.1 cockroach refuses `crdb_internal` reads unless the session sets
 * `allow_unsafe_internals`, so create the connection with
 * `connection: { allow_unsafe_internals: 'true', application_name: PROBE_APPLICATION_NAME }`.
 *
 * Cockroach keeps no written-rows counter, so `rowsWritten` is absent.
 */
export async function readCockroachStats(
  sql: Sql,
  options: CockroachStatsOptions = {},
): Promise<EngineSnapshot> {
  const { top = 0, probeApplicationName = PROBE_APPLICATION_NAME } = options

  const [totals] = await sql`
    SELECT COALESCE(SUM(count), 0) AS calls,
           COALESCE(SUM(rows_avg * count::FLOAT8), 0) AS rows
    FROM crdb_internal.node_statement_statistics
    WHERE application_name NOT LIKE ${INTERNAL_APPLICATIONS}
      AND application_name <> ${probeApplicationName}
  `
  return {
    available: true,
    statements: Number(totals?.calls ?? 0),
    // An average times a call count, since cockroach keeps no total: right in
    // aggregate, not to the unit. The cast is there because cockroach has no
    // float * int operator.
    rowsReturned: Math.round(Number(totals?.rows ?? 0)),
    ...(top > 0 ? { topStatements: await readCockroachTop(sql, top, probeApplicationName) } : {}),
  }
}

async function readCockroachTop(
  sql: Sql,
  top: number,
  probeApplicationName: string,
): Promise<StatementStats[]> {
  const rows = await sql`
    SELECT key AS query, count, service_lat_avg
    FROM crdb_internal.node_statement_statistics
    WHERE application_name NOT LIKE ${INTERNAL_APPLICATIONS}
      AND application_name <> ${probeApplicationName}
    ORDER BY service_lat_avg * count::FLOAT8 DESC
    LIMIT ${top}
  `
  return rows.map((row) => ({
    query: normalizeStatement(String(row.query)),
    calls: Number(row.count),
    // service_lat_avg is in seconds.
    totalMs: Number(row.service_lat_avg) * 1000 * Number(row.count),
  }))
}
