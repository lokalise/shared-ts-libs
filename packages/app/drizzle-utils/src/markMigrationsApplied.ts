import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

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

export interface MarkMigrationsAppliedOptions {
  /**
   * Path to the Drizzle migrations folder.
   * Supports both the legacy journal format (meta/_journal.json with flat SQL files)
   * and the new folder-per-migration format (drizzle-kit 1.0.0-beta).
   */
  migrationsFolder: string
  /** SQL executor for running queries against the database. */
  executor: SqlExecutor
  /**
   * Database dialect. If omitted, auto-detected from the journal or snapshot files.
   * Must be 'postgresql', 'mysql', or 'cockroachdb'.
   */
  dialect?: Dialect
  /**
   * Name of the migrations tracking table.
   * @default '__drizzle_migrations'
   */
  migrationsTable?: string
  /**
   * Schema for the migrations table (PostgreSQL and CockroachDB only).
   * @default 'drizzle'
   */
  migrationsSchema?: string
}

export interface MarkMigrationsAppliedResult {
  /** Total migrations found in the journal. */
  total: number
  /** Migrations that were newly marked as applied. */
  applied: number
  /** Migrations that were already tracked in the database. */
  skipped: number
  /** Details per migration. */
  entries: Array<{
    tag: string
    status: 'applied' | 'skipped'
  }>
}

const SUPPORTED_DIALECTS = new Set<string>(['postgresql', 'mysql', 'cockroachdb'])

const DIALECT_ALIASES: Record<string, string> = {
  pg: 'postgresql',
  postgres: 'postgresql',
}

function normalizeDialect(dialect: string): string {
  return DIALECT_ALIASES[dialect] ?? dialect
}

function isPgLike(dialect: Dialect): boolean {
  return dialect === 'postgresql' || dialect === 'cockroachdb'
}

function quoteIdentifier(name: string, dialect: Dialect): string {
  if (dialect === 'mysql') {
    return `\`${name}\``
  }
  return `"${name}"`
}

function qualifiedTableName(table: string, schema: string | undefined, dialect: Dialect): string {
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

function readMigrationsWithDialect(folder: string): { entries: MigrationEntry[]; dialect: string } {
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

function resolveDialect(detectedDialect: string, explicit?: Dialect): Dialect {
  const dialect = explicit ?? normalizeDialect(detectedDialect)

  if (!SUPPORTED_DIALECTS.has(dialect)) {
    throw new Error(
      `Unsupported dialect "${dialect}". Supported: ${[...SUPPORTED_DIALECTS].join(', ')}`,
    )
  }

  return dialect as Dialect
}

/**
 * Sets the Drizzle migration baseline for an existing database.
 *
 * When migrating from another ORM (e.g. Prisma, TypeORM, Sequelize) to Drizzle,
 * the database already has the correct schema in place. This function populates
 * Drizzle's `__drizzle_migrations` tracking table so that `drizzle-kit migrate`
 * treats all existing migrations as already applied, establishing a baseline.
 *
 * From that point on, only new migrations will be executed by Drizzle.
 *
 * The function is idempotent — safe to run multiple times.
 * Run once per environment (local, staging, production) during the ORM transition.
 *
 * Supports both the legacy journal format (drizzle-kit 0.x) and the new
 * folder-per-migration format (drizzle-kit 1.0.0-beta).
 */
export async function markMigrationsApplied(
  options: MarkMigrationsAppliedOptions,
): Promise<MarkMigrationsAppliedResult> {
  const {
    migrationsFolder,
    executor,
    migrationsTable = '__drizzle_migrations',
    migrationsSchema = 'drizzle',
  } = options

  const folder = resolve(migrationsFolder)
  const { entries, dialect: detectedDialect } = readMigrationsWithDialect(folder)
  const dialect = resolveDialect(detectedDialect, options.dialect)

  if (entries.length === 0) {
    return { total: 0, applied: 0, skipped: 0, entries: [] }
  }

  // Create schema (PostgreSQL/CockroachDB only) and migrations table
  if (isPgLike(dialect)) {
    await executor.run(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(migrationsSchema, dialect)}`)
  }

  const tableName = qualifiedTableName(migrationsTable, migrationsSchema, dialect)

  await executor.run(
    `CREATE TABLE IF NOT EXISTS ${tableName} (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
  )

  // Fetch already-tracked hashes
  const existingRows = await executor.all(`SELECT hash FROM ${tableName}`)
  const existingHashes = new Set(existingRows.map((row) => String(row.hash)))

  // Insert missing migrations
  const result: MarkMigrationsAppliedResult = {
    total: entries.length,
    applied: 0,
    skipped: 0,
    entries: [],
  }

  for (const entry of entries) {
    if (existingHashes.has(entry.hash)) {
      result.skipped++
      result.entries.push({ tag: entry.tag, status: 'skipped' })
      continue
    }

    // Hash is a hex string, createdAt is a number — safe to interpolate
    await executor.run(
      `INSERT INTO ${tableName} (hash, created_at) VALUES ('${entry.hash}', ${entry.createdAt})`,
    )

    result.applied++
    result.entries.push({ tag: entry.tag, status: 'applied' })
  }

  return result
}
