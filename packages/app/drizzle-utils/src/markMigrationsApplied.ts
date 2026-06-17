// Establishes the Drizzle migration baseline for a pre-existing database.
//
// Background: when migrating from Prisma to Drizzle, production/staging
// databases already have the full schema in place (created by the historical
// Prisma migrations). The freshly generated Drizzle migrations describe
// creating those same tables, so running `drizzle-kit migrate` against such a
// database would fail with "table already exists". To avoid that, this helper
// populates Drizzle's `__drizzle_migrations` tracking table so those migrations
// are recorded as already applied (a "baseline"), and `drizzle-kit migrate`
// then skips them.
//
// This step is designed to run on EVERY deploy, before `drizzle-kit migrate`,
// so it must behave correctly in these situations:
//   1. Brand-new / empty database (e.g. CI smoke test): there is no legacy
//      schema to baseline. We SKIP baselining, so `drizzle-kit migrate` creates
//      every table normally.
//   2. Existing pre-Drizzle (Prisma) database: the tables exist but there is no
//      `__drizzle_migrations` table yet. We baseline so migrate treats the
//      existing schema as already applied.
//   3. Already-baselined Drizzle database that is MISSING one or more newly
//      added baseline migrations. This happens when a baseline-type migration
//      (one describing pre-existing tables, e.g. `..._prisma_migration_copy`)
//      is added to the repo AFTER a database was already baselined: that DB's
//      `__drizzle_migrations` only lists the migrations that existed at baseline
//      time, so `drizzle-kit migrate` would try to actually run the new one and
//      fail with "table already exists". We must record the missing rows too.
//   4. Fully baselined database: every migration is already recorded; we do
//      nothing.
//
// Why we populate the `name` column (and not just `hash` + `created_at`):
// drizzle-orm >= 1.0.0-rc
// decides which migrations to run by matching the `name` column of
// `__drizzle_migrations` (see getMigrationsToRun in drizzle-orm/migrator.utils),
// so a row with a NULL `name` is treated as "not applied" and the migration
// runs anyway. We therefore insert rows with `name` populated, in the v1 table
// shape that the current drizzle-orm expects.
//
// Why this takes a Drizzle `db` instead of a raw driver connection: Drizzle is
// the universal way the consuming apps already talk to the database. Accepting a
// `db` keeps this helper driver-agnostic (mysql2, postgres-js, …) — the only
// dialect-specific bits left are the SQL strings themselves, which we branch on
// the explicit `dialect`.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { sql } from 'drizzle-orm'

const DEFAULT_DRIZZLE_MIGRATIONS_TABLE = '__drizzle_migrations'
const DEFAULT_DRIZZLE_MIGRATIONS_SCHEMA = 'drizzle'

export type Dialect = 'postgresql' | 'mysql' | 'cockroachdb'

export type MigrationFormat = 'journal' | 'folder'

export interface MigrationJournalEntry {
  idx: number
  version: string
  when: number
  tag: string
  breakpoints: boolean
}

export interface MigrationJournal {
  version: string
  dialect: string
  entries: MigrationJournalEntry[]
}

export interface MigrationEntry {
  tag: string
  hash: string
  createdAt: number
}

/**
 * Minimal interface for executing raw SQL queries.
 * Users adapt their database driver to this interface.
 *
 * @example PostgreSQL (postgres.js)
 * ```typescript
 * import postgres from 'postgres'
 * const sql = postgres(DATABASE_URL)
 * const executor = {
 *   run: (query: string) => sql.unsafe(query).then(() => {}),
 *   all: (query: string) => sql.unsafe(query) as Promise<Record<string, unknown>[]>,
 * }
 * ```
 *
 * @example MySQL (mysql2)
 * ```typescript
 * import mysql from 'mysql2/promise'
 * const conn = await mysql.createConnection(DATABASE_URL)
 * const executor = {
 *   run: (query: string) => conn.execute(query).then(() => {}),
 *   all: (query: string) => conn.execute(query).then(([rows]) => rows as Record<string, unknown>[]),
 * }
 * ```
 */
export interface SqlExecutor {
  /** Execute a statement that modifies data or schema (no return value needed). */
  run(sql: string): Promise<void>
  /** Execute a query that returns rows. */
  all(sql: string): Promise<Record<string, unknown>[]>
}

const SUPPORTED_DIALECTS = new Set<string>(['postgresql', 'mysql', 'cockroachdb'])

const DIALECT_ALIASES: Record<string, string> = {
  pg: 'postgresql',
  postgres: 'postgresql',
}

function normalizeDialect(dialect: string): string {
  return DIALECT_ALIASES[dialect] ?? dialect
}

export function isPgLike(dialect: Dialect): boolean {
  return dialect === 'postgresql' || dialect === 'cockroachdb'
}

export function quoteIdentifier(name: string, dialect: Dialect): string {
  if (dialect === 'mysql') {
    return `\`${name}\``
  }
  return `"${name}"`
}

export function qualifiedTableName(
  table: string,
  schema: string | undefined,
  dialect: Dialect,
): string {
  if (isPgLike(dialect) && schema) {
    return `${quoteIdentifier(schema, dialect)}.${quoteIdentifier(table, dialect)}`
  }
  return quoteIdentifier(table, dialect)
}

/** Compute the SHA-256 hash of a migration SQL file, matching Drizzle's internal algorithm. */
export function computeMigrationHash(sqlContent: string): string {
  return createHash('sha256').update(sqlContent).digest('hex')
}

/** Detect whether a migrations folder uses the legacy journal format or the new folder-per-migration format. */
export function detectMigrationFormat(migrationsFolder: string): MigrationFormat {
  const journalPath = join(resolve(migrationsFolder), 'meta', '_journal.json')
  return existsSync(journalPath) ? 'journal' : 'folder'
}

/** Read and parse the Drizzle migration journal from a migrations folder (legacy format only). */
export function readMigrationJournal(migrationsFolder: string): MigrationJournal {
  const journalPath = join(resolve(migrationsFolder), 'meta', '_journal.json')
  const content = readFileSync(journalPath, 'utf-8')
  return JSON.parse(content) as MigrationJournal
}

function parseFolderTimestamp(folderName: string): number {
  const match = folderName.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/)
  if (!match) return 0
  const [, y, m, d, h, min, s] = match
  return Date.UTC(Number(y), Number(m) - 1, Number(d), Number(h), Number(min), Number(s))
}

function readNewFormatMigrations(folder: string): { entries: MigrationEntry[]; dialect: string } {
  const items = readdirSync(folder, { withFileTypes: true })

  const migrationDirs = items
    .filter((item) => item.isDirectory() && existsSync(join(folder, item.name, 'migration.sql')))
    .map((item) => item.name)
    .sort()

  let dialect: string | undefined
  const entries: MigrationEntry[] = []

  for (const dir of migrationDirs) {
    const sqlPath = join(folder, dir, 'migration.sql')
    const snapshotPath = join(folder, dir, 'snapshot.json')
    const sqlContent = readFileSync(sqlPath, 'utf-8')

    if (!dialect && existsSync(snapshotPath)) {
      const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf-8'))
      if (snapshot.dialect) {
        dialect = normalizeDialect(snapshot.dialect as string)
      }
    }

    entries.push({
      tag: dir,
      hash: computeMigrationHash(sqlContent),
      createdAt: parseFolderTimestamp(dir),
    })
  }

  return { entries, dialect: dialect ?? 'postgresql' }
}

/**
 * Read all migration entries together with the dialect detected from the
 * journal (legacy format) or the first snapshot (folder format). Supports both
 * the legacy journal format and the new folder-per-migration format.
 */
export function readMigrationsWithDialect(folder: string): {
  entries: MigrationEntry[]
  dialect: string
} {
  const format = detectMigrationFormat(folder)

  if (format === 'journal') {
    const journal = readMigrationJournal(folder)
    const entries = journal.entries.map((entry) => {
      const sqlPath = join(folder, `${entry.tag}.sql`)
      const sqlContent = readFileSync(sqlPath, 'utf-8')
      return {
        tag: entry.tag,
        hash: computeMigrationHash(sqlContent),
        createdAt: entry.when,
      }
    })
    return { entries, dialect: journal.dialect }
  }

  return readNewFormatMigrations(folder)
}

/**
 * Read all migration entries from a Drizzle migrations folder,
 * computing the SHA-256 hash for each migration SQL file.
 * Supports both the legacy journal format and the new folder-per-migration format.
 */
export function readMigrationEntries(migrationsFolder: string): MigrationEntry[] {
  return readMigrationsWithDialect(resolve(migrationsFolder)).entries
}

/**
 * Resolve and validate the effective dialect, preferring an explicit value and
 * falling back to the one detected from the migration files.
 */
export function resolveDialect(detectedDialect: string, explicit?: Dialect): Dialect {
  const dialect = explicit ?? normalizeDialect(detectedDialect)

  if (!SUPPORTED_DIALECTS.has(dialect)) {
    throw new Error(
      `Unsupported dialect "${dialect}". Supported: ${[...SUPPORTED_DIALECTS].join(', ')}`,
    )
  }

  return dialect as Dialect
}

/**
 * Minimal shape of a Drizzle database client: anything exposing an `execute`
 * that accepts a Drizzle `SQL` chunk. This covers `drizzle(...)` instances for
 * every driver (postgres-js, mysql2, …) without coupling to a concrete one.
 *
 * The return shape differs per driver — postgres-js resolves to a row array,
 * while mysql2 resolves to a `[rows, fields]` tuple — so {@link selectRows}
 * normalizes both.
 */
export interface DrizzleExecutor {
  execute(query: ReturnType<typeof sql.raw>): Promise<unknown>
}

export interface MarkMigrationsAppliedOptions {
  /** Drizzle database instance (any driver). Used as the universal query channel. */
  db: DrizzleExecutor
  /**
   * Database dialect — selects the dialect-specific SQL (quoting, CREATE DATABASE
   * syntax, …). If omitted, auto-detected from the journal or snapshot files.
   */
  dialect?: Dialect
  /**
   * Path to the Drizzle migrations folder. Supports both the legacy journal
   * format (`meta/_journal.json` with flat SQL files) and the new
   * folder-per-migration format (`<timestamp>_<name>/migration.sql`).
   */
  migrationsFolder: string
  /**
   * Name of the database to ensure exists before baselining.
   * When omitted, the database-creation step is skipped (the `db` instance is
   * assumed to already point at an existing database).
   */
  databaseName?: string
  /**
   * Name of a table that only exists in the legacy (pre-Drizzle) schema. Its
   * presence is the signal that this database needs baselining. When omitted,
   * baselining always runs (no fresh-database short-circuit).
   */
  legacySchemaProbeTable?: string
  /**
   * Name of the migrations tracking table.
   * @default '__drizzle_migrations'
   */
  migrationsTable?: string
  /**
   * Schema for the migrations table (PostgreSQL and CockroachDB only). This must
   * match the schema `drizzle-kit migrate` looks in, otherwise the baseline rows
   * are written where migrate won't see them.
   * @default 'drizzle'
   */
  migrationsSchema?: string
  /** Optional logger; defaults to no-op. Receives human-readable progress lines. */
  log?: (message: string) => void
}

export interface MarkMigrationsAppliedResult {
  /** What the helper did: 'skipped-fresh' | 'skipped-no-migrations' | 'baselined'. */
  outcome: 'skipped-fresh' | 'skipped-no-migrations' | 'baselined'
  /** Total migrations discovered in the folder. */
  total: number
  /** Migrations newly recorded as applied. */
  applied: number
  /** Migrations already present in the tracking table. */
  skipped: number
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

// Drizzle's `execute` return type is driver-dependent: postgres-js gives a row
// array, mysql2 gives `[rows, fields]`. Normalize to a plain row array.
function selectRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) {
    // mysql2: [rows, fields] — the first element is the rows array.
    const [first] = result as unknown[]
    if (Array.isArray(first)) {
      return first as Record<string, unknown>[]
    }
    // postgres-js: the result already IS the row array.
    return result as Record<string, unknown>[]
  }
  // Some drivers wrap rows under `.rows` (e.g. node-postgres).
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: Record<string, unknown>[] }).rows
  }
  return []
}

async function run(db: DrizzleExecutor, query: string): Promise<void> {
  await db.execute(sql.raw(query))
}

async function all(db: DrizzleExecutor, query: string): Promise<Record<string, unknown>[]> {
  return selectRows(await db.execute(sql.raw(query)))
}

// Creates the target database if it does not exist. `drizzle-kit migrate` (and
// this baseline) can only operate on an existing database; previously Prisma's
// `migrate deploy` created it implicitly.
//
// NOTE: this runs through the provided `db`, so the connection must have rights
// to issue CREATE DATABASE. For Postgres/CockroachDB the connection must also
// not already be inside the target database with an open transaction, since
// CREATE DATABASE cannot run transactionally there.
async function ensureDatabaseExists(
  db: DrizzleExecutor,
  dialect: Dialect,
  databaseName: string,
): Promise<void> {
  const quoted = quoteIdentifier(databaseName, dialect)
  if (dialect === 'mysql') {
    await run(db, `CREATE DATABASE IF NOT EXISTS ${quoted}`)
    return
  }
  // Postgres / CockroachDB: no IF NOT EXISTS for CREATE DATABASE on older
  // engines, so tolerate the "already exists" error instead.
  try {
    await run(db, `CREATE DATABASE ${quoted}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/already exists/i.test(message)) {
      throw error
    }
  }
}

async function tableExists(
  db: DrizzleExecutor,
  dialect: Dialect,
  tableName: string,
): Promise<boolean> {
  // information_schema.tables exists in MySQL, Postgres and CockroachDB. We
  // scope to the current database/schema generically: in MySQL `table_schema`
  // is the database (DATABASE()); in Postgres it is the schema, so we look at
  // whatever schema(s) are on the search_path by simply matching table_name in
  // the current catalog.
  if (dialect === 'mysql') {
    const rows = await all(
      db,
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = ${quoteLiteral(tableName)} LIMIT 1`,
    )
    return rows.length > 0
  }
  const rows = await all(
    db,
    `SELECT 1 FROM information_schema.tables
      WHERE table_catalog = current_database() AND table_name = ${quoteLiteral(tableName)} LIMIT 1`,
  )
  return rows.length > 0
}

// Creates `__drizzle_migrations` (and, for PG/CRDB, its schema) in the shape
// drizzle-orm expects (v1, with the `name` column). If it already exists, this
// is a no-op; an older v0 table (id/hash/created_at only) is upgraded by
// `drizzle-kit migrate` afterwards, and our name-populated inserts remain
// compatible with that upgrade.
async function ensureMigrationsTable(
  db: DrizzleExecutor,
  dialect: Dialect,
  qualifiedTable: string,
  migrationsSchema: string,
): Promise<void> {
  if (isPgLike(dialect)) {
    await run(db, `CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(migrationsSchema, dialect)}`)
  }
  await run(
    db,
    `CREATE TABLE IF NOT EXISTS ${qualifiedTable} (
      id serial PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint,
      name text
    )`,
  )
}

async function fetchRecordedNames(
  db: DrizzleExecutor,
  qualifiedTable: string,
): Promise<Set<string>> {
  const rows = await all(db, `SELECT name FROM ${qualifiedTable}`)
  const names = new Set<string>()
  for (const row of rows as Array<{ name?: string | null }>) {
    if (row.name) {
      names.add(row.name)
    }
  }
  return names
}

/**
 * Establishes (or tops up) the Drizzle migration baseline for a pre-existing
 * database, using a Drizzle `db` instance as the universal query channel so the
 * helper is driver-agnostic.
 *
 * Idempotent and safe to run before every `drizzle-kit migrate`. See the file
 * header for the four scenarios it handles.
 */
export async function markMigrationsApplied(
  options: MarkMigrationsAppliedOptions,
): Promise<MarkMigrationsAppliedResult> {
  const {
    db,
    migrationsFolder,
    databaseName,
    legacySchemaProbeTable,
    migrationsTable = DEFAULT_DRIZZLE_MIGRATIONS_TABLE,
    migrationsSchema = DEFAULT_DRIZZLE_MIGRATIONS_SCHEMA,
    log = () => {},
  } = options

  // Read the migrations (journal or folder format) and detect the dialect from
  // them, letting an explicit `dialect` option win.
  const { entries, dialect: detectedDialect } = readMigrationsWithDialect(resolve(migrationsFolder))
  const dialect = resolveDialect(detectedDialect, options.dialect)

  if (databaseName) {
    await ensureDatabaseExists(db, dialect, databaseName)
  }

  if (legacySchemaProbeTable) {
    const hasLegacySchema = await tableExists(db, dialect, legacySchemaProbeTable)
    if (!hasLegacySchema) {
      log(
        'Drizzle migration baseline: fresh database detected, skipping baseline so migrations run normally.',
      )
      return { outcome: 'skipped-fresh', total: 0, applied: 0, skipped: 0 }
    }
  }

  if (entries.length === 0) {
    log('Drizzle migration baseline: no migration files found, nothing to do.')
    return { outcome: 'skipped-no-migrations', total: 0, applied: 0, skipped: 0 }
  }

  const table = qualifiedTableName(migrationsTable, migrationsSchema, dialect)
  await ensureMigrationsTable(db, dialect, table, migrationsSchema)
  const recordedNames = await fetchRecordedNames(db, table)

  let applied = 0
  for (const entry of entries) {
    if (recordedNames.has(entry.tag)) {
      log(`  = ${entry.tag}`)
      continue
    }
    await run(
      db,
      `INSERT INTO ${table} (hash, created_at, name)
        VALUES (${quoteLiteral(entry.hash)}, ${entry.createdAt}, ${quoteLiteral(entry.tag)})`,
    )
    applied++
    log(`  + ${entry.tag}`)
  }

  const skipped = entries.length - applied
  log(
    `Drizzle migration baseline: ${applied} recorded, ${skipped} already present (of ${entries.length} total).`,
  )
  return { outcome: 'baselined', total: entries.length, applied, skipped }
}
