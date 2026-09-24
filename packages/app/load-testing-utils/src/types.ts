/** One statement, as a database's own statistics report it. */
export type StatementStats = {
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
}

/** The body the database probe answers `GET /db-stats` with. */
export type ProbeSnapshot = {
  at: string
  engines: Record<string, EngineSnapshot>
}
