/** One statement, as a database's own statistics report it. */
export type StatementStats = {
  /**
   * What identifies the statement across two snapshots: `queryid` on Postgres,
   * the fingerprint on CockroachDB. A report falls back to `query` without it.
   */
  key?: string
  query: string
  calls: number
  totalMs: number
}

/**
 * What one database engine did, as cumulative counters since its statistics
 * were last reset. A report reads two of these and prints the difference.
 */
export type EngineSnapshot = {
  available: boolean
  /** Why not, when `available` is false. A caveat, when it is true. */
  reason?: string
  statements: number
  rowsReturned: number
  /** Absent for an engine that keeps no write counter, so a report omits it instead of printing zero. */
  rowsWritten?: number
  /** Ranked by database time, most expensive first. */
  topStatements?: StatementStats[]
  /**
   * Every statement, for `?statements=all`. A report diffs two of these to rank
   * what a run cost, which a top N from each end cannot do.
   */
  allStatements?: StatementStats[]
}

/** The body the database probe answers `GET /db-stats` with. */
export type ProbeSnapshot = {
  at: string
  engines: Record<string, EngineSnapshot>
}
