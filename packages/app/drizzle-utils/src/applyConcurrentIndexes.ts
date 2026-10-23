// Builds PostgreSQL indexes with CREATE INDEX CONCURRENTLY, outside of `drizzle-kit migrate`.
//
// drizzle-orm applies every pending migration inside a single transaction, and
// PostgreSQL rejects CONCURRENTLY inside a transaction block. A plain CREATE
// INDEX holds a lock that blocks writes for the whole build, which is too long
// on large tables. This helper runs before `drizzle-kit migrate` on every
// deploy; the Drizzle migration for the same index keeps `IF NOT EXISTS` and
// becomes a no-op once the index is in place.
//
// A failed or interrupted concurrent build leaves an INVALID index behind, and
// `IF NOT EXISTS` would silently keep it. Such an index is dropped and built
// again. An index whose table does not exist yet (a fresh database) is skipped,
// so the regular migration creates both.
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { sql } from 'drizzle-orm'
import { type DrizzleExecutor, quoteLiteral, selectRows } from './markMigrationsApplied.ts'

const IDENTIFIER = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][\w$]*)`
const CREATE_INDEX_CONCURRENTLY = new RegExp(
  String.raw`^CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+(${IDENTIFIER})\s+ON\s+((?:${IDENTIFIER}\.)?${IDENTIFIER})[\s(]`,
  'i',
)

export interface ConcurrentIndexStatement {
  /** SQL file the statement was read from. */
  file: string
  /** Unquoted index name. */
  indexName: string
  /** Table reference as written in the statement, optionally schema-qualified. */
  tableName: string
  statement: string
}

export interface ApplyConcurrentIndexesOptions {
  /** Drizzle database instance for PostgreSQL. Must not be inside a transaction. */
  db: DrizzleExecutor
  /** Folder with `.sql` files of `CREATE [UNIQUE] INDEX CONCURRENTLY IF NOT EXISTS` statements, applied in file name order. */
  folder: string
  /** Optional logger; defaults to no-op. Receives human-readable progress lines. */
  log?: (message: string) => void
}

export interface ApplyConcurrentIndexesResult {
  /** Indexes built in this run. */
  created: string[]
  /** INVALID indexes dropped and built again in this run. */
  rebuilt: string[]
  /** Valid indexes that were already in place. */
  existing: string[]
  /** Indexes skipped because their table does not exist yet. */
  missingTable: string[]
}

function unquoteIdentifier(identifier: string): string {
  return identifier.startsWith('"')
    ? identifier.slice(1, -1).replaceAll('""', '"')
    : identifier.toLowerCase()
}

function splitStatements(content: string): string[] {
  return content
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
}

function parseStatement(file: string, statement: string): ConcurrentIndexStatement {
  const [, indexName, tableName] = CREATE_INDEX_CONCURRENTLY.exec(statement) ?? []
  if (!indexName || !tableName) {
    throw new Error(
      `${file}: expected "CREATE [UNIQUE] INDEX CONCURRENTLY IF NOT EXISTS <name> ON <table> ...", got: ${statement}`,
    )
  }
  return { file, indexName: unquoteIdentifier(indexName), tableName, statement }
}

/**
 * Read and validate every statement in the folder. Throws on the first
 * statement that is not an idempotent concurrent index build, so nothing runs
 * when any file is malformed.
 */
export function readConcurrentIndexStatements(folder: string): ConcurrentIndexStatement[] {
  const dir = resolve(folder)
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .flatMap((file) =>
      splitStatements(readFileSync(join(dir, file), 'utf-8')).map((statement) =>
        parseStatement(file, statement),
      ),
    )
}

async function all(db: DrizzleExecutor, query: string): Promise<Record<string, unknown>[]> {
  return selectRows(await db.execute(sql.raw(query)))
}

async function tableExists(db: DrizzleExecutor, tableName: string): Promise<boolean> {
  const [row] = await all(
    db,
    `SELECT to_regclass(${quoteLiteral(tableName)}) IS NOT NULL AS table_exists`,
  )
  return row?.table_exists === true
}

interface ExistingIndex {
  valid: boolean
  qualifiedName: string
  buildingPid: number | null
}

async function findIndex(
  db: DrizzleExecutor,
  entry: ConcurrentIndexStatement,
): Promise<ExistingIndex | undefined> {
  const [row] = await all(
    db,
    `SELECT i.indisvalid AS valid,
            quote_ident(n.nspname) || '.' || quote_ident(c.relname) AS qualified_name,
            p.pid AS building_pid
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_index i ON i.indexrelid = c.oid
       LEFT JOIN pg_stat_progress_create_index p ON p.index_relid = c.oid
      WHERE c.relname = ${quoteLiteral(entry.indexName)}
        AND c.relnamespace = (
          SELECT relnamespace FROM pg_class WHERE oid = to_regclass(${quoteLiteral(entry.tableName)})
        )`,
  )
  if (!row) {
    return undefined
  }
  return {
    valid: row.valid === true,
    qualifiedName: String(row.qualified_name),
    buildingPid: typeof row.building_pid === 'number' ? row.building_pid : null,
  }
}

/**
 * Build every index from the folder with CREATE INDEX CONCURRENTLY, skipping
 * valid ones and rebuilding INVALID ones. Idempotent and safe to run before
 * every `drizzle-kit migrate`. PostgreSQL only.
 */
export async function applyConcurrentIndexes(
  options: ApplyConcurrentIndexesOptions,
): Promise<ApplyConcurrentIndexesResult> {
  const { db, folder, log = () => {} } = options
  const entries = readConcurrentIndexStatements(folder)
  const result: ApplyConcurrentIndexesResult = {
    created: [],
    rebuilt: [],
    existing: [],
    missingTable: [],
  }

  for (const entry of entries) {
    if (!(await tableExists(db, entry.tableName))) {
      log(`  ~ ${entry.indexName}: table ${entry.tableName} does not exist yet`)
      result.missingTable.push(entry.indexName)
      continue
    }

    const index = await findIndex(db, entry)
    if (index?.valid) {
      log(`  = ${entry.indexName}`)
      result.existing.push(entry.indexName)
      continue
    }

    if (index) {
      if (index.buildingPid !== null) {
        throw new Error(
          `Index ${index.qualifiedName} is being built by backend ${index.buildingPid}`,
        )
      }
      log(`  ! ${entry.indexName}: dropping INVALID index`)
      await db.execute(sql.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${index.qualifiedName}`))
    }

    log(`  + ${entry.indexName}`)
    await db.execute(sql.raw(entry.statement))
    if (index) {
      result.rebuilt.push(entry.indexName)
    } else {
      result.created.push(entry.indexName)
    }
  }

  log(
    `Concurrent indexes: ${result.created.length} created, ${result.rebuilt.length} rebuilt, ${result.existing.length} existing, ${result.missingTable.length} skipped (of ${entries.length} total).`,
  )
  return result
}
