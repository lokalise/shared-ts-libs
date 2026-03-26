import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import mysql from 'mysql2/promise'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { getDatabaseUrl } from '../test/getDatabaseUrl.ts'
import { getMysqlDatabaseUrl } from '../test/getMysqlDatabaseUrl.ts'
import {
  computeMigrationHash,
  markMigrationsApplied,
  readMigrationEntries,
  readMigrationJournal,
  type SqlExecutor,
} from './markMigrationsApplied.ts'

const FIXTURES_DIR = resolve(__dirname, '../test/fixtures')
const PG_MIGRATIONS_DIR = join(FIXTURES_DIR, 'migrations')
const MYSQL_MIGRATIONS_DIR = join(FIXTURES_DIR, 'migrations-mysql')

// ─── Pure function tests (no database) ───

describe('computeMigrationHash', () => {
  it('returns a SHA-256 hex digest', () => {
    const hash = computeMigrationHash('SELECT 1;')
    const expected = createHash('sha256').update('SELECT 1;').digest('hex')
    expect(hash).toBe(expected)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns different hashes for different content', () => {
    const hash1 = computeMigrationHash('CREATE TABLE a (id int);')
    const hash2 = computeMigrationHash('CREATE TABLE b (id int);')
    expect(hash1).not.toBe(hash2)
  })
})

describe('readMigrationJournal', () => {
  it('reads and parses the journal file', () => {
    const journal = readMigrationJournal(PG_MIGRATIONS_DIR)
    expect(journal.dialect).toBe('postgresql')
    expect(journal.entries).toHaveLength(2)
    expect(journal.entries[0].tag).toBe('0000_init')
    expect(journal.entries[1].tag).toBe('0001_add_users')
  })

  it('throws when journal does not exist', () => {
    expect(() => readMigrationJournal('/nonexistent/path')).toThrow()
  })
})

describe('readMigrationEntries', () => {
  it('reads entries with computed hashes', () => {
    const entries = readMigrationEntries(PG_MIGRATIONS_DIR)
    expect(entries).toHaveLength(2)

    const initSql = readFileSync(join(PG_MIGRATIONS_DIR, '0000_init.sql'), 'utf-8')
    const expectedHash = createHash('sha256').update(initSql).digest('hex')

    expect(entries[0].tag).toBe('0000_init')
    expect(entries[0].hash).toBe(expectedHash)
    expect(entries[0].createdAt).toBe(1700000000000)
  })
})

// ─── PostgreSQL integration tests ───

describe('markMigrationsApplied (PostgreSQL)', () => {
  const sql = postgres(getDatabaseUrl())
  const db = drizzle({ client: sql })

  const testSchema = 'drizzle_test'
  const testTable = '__drizzle_migrations_test'

  const executor: SqlExecutor = {
    run: (query: string) => sql.unsafe(query).then(() => {}),
    all: (query: string) => sql.unsafe(query) as Promise<Record<string, unknown>[]>,
  }

  beforeEach(async () => {
    await db.execute(`DROP TABLE IF EXISTS "${testSchema}"."${testTable}"`)
    await db.execute(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`)
  })

  afterAll(async () => {
    await db.execute(`DROP TABLE IF EXISTS "${testSchema}"."${testTable}"`)
    await db.execute(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`)
    await sql.end()
  })

  it('creates schema, table, and inserts all migrations', async () => {
    const result = await markMigrationsApplied({
      migrationsFolder: PG_MIGRATIONS_DIR,
      executor,
      dialect: 'postgresql',
      migrationsTable: testTable,
      migrationsSchema: testSchema,
    })

    expect(result.total).toBe(2)
    expect(result.applied).toBe(2)
    expect(result.skipped).toBe(0)
    expect(result.entries).toEqual([
      { tag: '0000_init', status: 'applied' },
      { tag: '0001_add_users', status: 'applied' },
    ])

    // Verify rows in database
    const rows = await sql.unsafe(
      `SELECT hash, created_at FROM "${testSchema}"."${testTable}" ORDER BY id`,
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].created_at).toBe('1700000000000') // bigint comes as string
  })

  it('is idempotent — skips already tracked migrations', async () => {
    await markMigrationsApplied({
      migrationsFolder: PG_MIGRATIONS_DIR,
      executor,
      dialect: 'postgresql',
      migrationsTable: testTable,
      migrationsSchema: testSchema,
    })

    const result = await markMigrationsApplied({
      migrationsFolder: PG_MIGRATIONS_DIR,
      executor,
      dialect: 'postgresql',
      migrationsTable: testTable,
      migrationsSchema: testSchema,
    })

    expect(result.total).toBe(2)
    expect(result.applied).toBe(0)
    expect(result.skipped).toBe(2)
    expect(result.entries).toEqual([
      { tag: '0000_init', status: 'skipped' },
      { tag: '0001_add_users', status: 'skipped' },
    ])

    // Still only 2 rows
    const rows = await sql.unsafe(`SELECT * FROM "${testSchema}"."${testTable}"`)
    expect(rows).toHaveLength(2)
  })

  it('auto-detects dialect from journal', async () => {
    const result = await markMigrationsApplied({
      migrationsFolder: PG_MIGRATIONS_DIR,
      executor,
      migrationsTable: testTable,
      migrationsSchema: testSchema,
    })

    expect(result.applied).toBe(2)
  })

  it('returns empty result for empty journal', async () => {
    // We'll use a mock executor since we never hit the DB for empty journals
    const noopExecutor: SqlExecutor = {
      run: () => Promise.resolve(),
      all: () => Promise.resolve([]),
    }

    // Create a temporary empty journal in a temp-like location
    // Instead, test by mocking — the function returns early before DB calls
    const { mkdtempSync, writeFileSync, mkdirSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const tempDir = mkdtempSync(join(tmpdir(), 'drizzle-test-'))
    mkdirSync(join(tempDir, 'meta'), { recursive: true })
    writeFileSync(
      join(tempDir, 'meta', '_journal.json'),
      JSON.stringify({ version: '7', dialect: 'postgresql', entries: [] }),
    )

    const result = await markMigrationsApplied({
      migrationsFolder: tempDir,
      executor: noopExecutor,
      dialect: 'postgresql',
    })

    expect(result).toEqual({ total: 0, applied: 0, skipped: 0, entries: [] })
  })

  it('throws for unsupported dialect', async () => {
    await expect(
      markMigrationsApplied({
        migrationsFolder: PG_MIGRATIONS_DIR,
        executor,
        dialect: 'sqlite' as any,
      }),
    ).rejects.toThrow('Unsupported dialect "sqlite"')
  })
})

// ─── MySQL SQL generation tests (mock executor) ───

describe('markMigrationsApplied (MySQL SQL generation)', () => {
  it('generates MySQL-compatible SQL with backtick quoting', async () => {
    const executedQueries: string[] = []
    const mockExecutor: SqlExecutor = {
      run: (query: string) => {
        executedQueries.push(query)
        return Promise.resolve()
      },
      all: () => Promise.resolve([]),
    }

    await markMigrationsApplied({
      migrationsFolder: MYSQL_MIGRATIONS_DIR,
      executor: mockExecutor,
      dialect: 'mysql',
    })

    // Should NOT create a schema (MySQL doesn't use schemas for migrations)
    expect(executedQueries.some((q) => q.includes('CREATE SCHEMA'))).toBe(false)

    // Should use backtick quoting for table name
    const createTable = executedQueries.find((q) => q.includes('CREATE TABLE'))
    expect(createTable).toContain('`__drizzle_migrations`')
    expect(createTable).not.toContain('"__drizzle_migrations"')

    // Should insert migration record
    const insert = executedQueries.find((q) => q.includes('INSERT'))
    expect(insert).toContain('`__drizzle_migrations`')
  })

  it('auto-detects mysql dialect from journal', async () => {
    const executedQueries: string[] = []
    const mockExecutor: SqlExecutor = {
      run: (query: string) => {
        executedQueries.push(query)
        return Promise.resolve()
      },
      all: () => Promise.resolve([]),
    }

    await markMigrationsApplied({
      migrationsFolder: MYSQL_MIGRATIONS_DIR,
      executor: mockExecutor,
    })

    const createTable = executedQueries.find((q) => q.includes('CREATE TABLE'))
    expect(createTable).toContain('`__drizzle_migrations`')
  })

  it('uses custom table name with backtick quoting', async () => {
    const executedQueries: string[] = []
    const mockExecutor: SqlExecutor = {
      run: (query: string) => {
        executedQueries.push(query)
        return Promise.resolve()
      },
      all: () => Promise.resolve([]),
    }

    await markMigrationsApplied({
      migrationsFolder: MYSQL_MIGRATIONS_DIR,
      executor: mockExecutor,
      dialect: 'mysql',
      migrationsTable: 'custom_migrations',
    })

    const createTable = executedQueries.find((q) => q.includes('CREATE TABLE'))
    expect(createTable).toContain('`custom_migrations`')
  })
})

// ─── MySQL integration tests (real database) ───

describe('markMigrationsApplied (MySQL integration)', () => {
  const testTable = '__drizzle_migrations_test'
  let connection: mysql.Connection

  const createExecutor = (conn: mysql.Connection): SqlExecutor => ({
    run: (query: string) => conn.execute(query).then(() => {}),
    all: (query: string) => conn.execute(query).then(([rows]) => rows as Record<string, unknown>[]),
  })

  beforeEach(async () => {
    connection = await mysql.createConnection(getMysqlDatabaseUrl())
    await connection.execute(`DROP TABLE IF EXISTS \`${testTable}\``)
  })

  afterAll(async () => {
    // Clean up - connection may have been closed by a test, create fresh one
    const conn = await mysql.createConnection(getMysqlDatabaseUrl())
    await conn.execute(`DROP TABLE IF EXISTS \`${testTable}\``)
    await conn.end()
  })

  it('creates table and inserts all migrations', async () => {
    const executor = createExecutor(connection)

    const result = await markMigrationsApplied({
      migrationsFolder: MYSQL_MIGRATIONS_DIR,
      executor,
      dialect: 'mysql',
      migrationsTable: testTable,
    })

    expect(result.total).toBe(1)
    expect(result.applied).toBe(1)
    expect(result.skipped).toBe(0)
    expect(result.entries).toEqual([{ tag: '0000_init', status: 'applied' }])

    // Verify rows in database
    const [rows] = await connection.execute(`SELECT hash, created_at FROM \`${testTable}\``)
    expect(rows).toHaveLength(1)

    await connection.end()
  })

  it('is idempotent — skips already tracked migrations', async () => {
    const executor = createExecutor(connection)

    await markMigrationsApplied({
      migrationsFolder: MYSQL_MIGRATIONS_DIR,
      executor,
      dialect: 'mysql',
      migrationsTable: testTable,
    })

    const result = await markMigrationsApplied({
      migrationsFolder: MYSQL_MIGRATIONS_DIR,
      executor,
      dialect: 'mysql',
      migrationsTable: testTable,
    })

    expect(result.total).toBe(1)
    expect(result.applied).toBe(0)
    expect(result.skipped).toBe(1)

    // Still only 1 row
    const [rows] = await connection.execute(`SELECT * FROM \`${testTable}\``)
    expect(rows).toHaveLength(1)

    await connection.end()
  })
})
