import type { Sql } from 'postgres'
import type { EngineSnapshot, StatementStats } from '../types.ts'
import { normalizeStatement } from './statements.ts'

/**
 * Postgres counters for the connected database.
 *
 * `pg_stat_statements` is the exact answer. It has to be preloaded
 * (`shared_preload_libraries`) and created in the database. Without it this
 * falls back to committed transactions from `pg_stat_database` and says so in
 * `reason`: the two agree while every statement is its own transaction, which
 * is the per-row write path a probe most needs to catch.
 */
export async function readPostgresStats(sql: Sql, top = 0): Promise<EngineSnapshot> {
  const [extension] = await sql`
    SELECT 1 AS present FROM pg_extension WHERE extname = 'pg_stat_statements'
  `
  const [database] = await sql`
    SELECT xact_commit, tup_returned, tup_inserted + tup_updated + tup_deleted AS written
    FROM pg_stat_database WHERE datname = current_database()
  `
  const rowsWritten = Number(database?.written ?? 0)

  if (!extension) {
    return {
      available: true,
      reason: 'pg_stat_statements is not installed; counting committed transactions instead',
      statements: Number(database?.xact_commit ?? 0),
      rowsReturned: Number(database?.tup_returned ?? 0),
      rowsWritten,
    }
  }

  const [totals] = await sql`
    SELECT COALESCE(SUM(calls), 0) AS calls, COALESCE(SUM(rows), 0) AS rows
    FROM pg_stat_statements
    WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
  `

  return {
    available: true,
    statements: Number(totals?.calls ?? 0),
    // `rows` counts rows a statement returned or affected, so it is the read
    // side; pg_stat_database separates the writes.
    rowsReturned: Number(totals?.rows ?? 0),
    rowsWritten,
    ...(top > 0 ? { topStatements: await readPostgresTop(sql, top) } : {}),
  }
}

/**
 * Ranked by database time, not by calls. A per-row write and the batched
 * statement replacing it differ a hundredfold in calls and little in time, and
 * a call ranking puts the cheap one on top.
 */
async function readPostgresTop(sql: Sql, top: number): Promise<StatementStats[]> {
  const rows = await sql`
    SELECT query, calls, total_exec_time AS total_ms
    FROM pg_stat_statements
    WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
    ORDER BY total_exec_time DESC
    LIMIT ${top}
  `
  return rows.map((row) => ({
    query: normalizeStatement(String(row.query)),
    calls: Number(row.calls),
    totalMs: Number(row.total_ms),
  }))
}
