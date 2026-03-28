import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export type Dialect = 'postgresql' | 'mysql' | 'cockroachdb'

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
  /** Path to the Drizzle migrations folder (containing meta/_journal.json). */
  migrationsFolder: string
  /** SQL executor for running queries against the database. */
  executor: SqlExecutor
  /**
   * Database dialect. If omitted, auto-detected from the journal's `dialect` field.
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

/** Read and parse the Drizzle migration journal from a migrations folder. */
export function readMigrationJournal(migrationsFolder: string): MigrationJournal {
  const journalPath = join(resolve(migrationsFolder), 'meta', '_journal.json')
  const content = readFileSync(journalPath, 'utf-8')
  return JSON.parse(content) as MigrationJournal
}

/**
 * Read all migration entries from a Drizzle migrations folder,
 * computing the SHA-256 hash for each migration SQL file.
 */
export function readMigrationEntries(migrationsFolder: string): MigrationEntry[] {
  const folder = resolve(migrationsFolder)
  const journal = readMigrationJournal(folder)

  return journal.entries.map((entry) => {
    const sqlPath = join(folder, `${entry.tag}.sql`)
    const sqlContent = readFileSync(sqlPath, 'utf-8')
    return {
      tag: entry.tag,
      hash: computeMigrationHash(sqlContent),
      createdAt: entry.when,
    }
  })
}

function resolveDialect(journal: MigrationJournal, explicit?: Dialect): Dialect {
  const dialect = explicit ?? journal.dialect

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
  const journal = readMigrationJournal(folder)
  const dialect = resolveDialect(journal, options.dialect)
  const entries = readMigrationEntries(folder)

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
