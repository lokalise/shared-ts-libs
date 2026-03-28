import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import mysql from 'mysql2/promise'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  cleanupGeneratedMigrations,
  generateNewFormatMigrations,
} from '../test/generateMigrations.ts'
import { getCockroachdbDatabaseUrl } from '../test/getCockroachdbDatabaseUrl.ts'
import { getDatabaseUrl } from '../test/getDatabaseUrl.ts'
import { getMysqlDatabaseUrl } from '../test/getMysqlDatabaseUrl.ts'
import {
  computeMigrationHash,
  detectMigrationFormat,
  markMigrationsApplied,
  readMigrationEntries,
  readMigrationJournal,
  type SqlExecutor,
} from './markMigrationsApplied.ts'

const FIXTURES_DIR = resolve(__dirname, '../test/fixtures')
const PG_MIGRATIONS_DIR = join(FIXTURES_DIR, 'migrations')
const COCKROACHDB_MIGRATIONS_DIR = join(FIXTURES_DIR, 'migrations-cockroachdb')
const MYSQL_MIGRATIONS_DIR = join(FIXTURES_DIR, 'migrations-mysql')
const PG_NEW_FORMAT_DIR = join(FIXTURES_DIR, 'migrations-new-format')
const COCKROACHDB_NEW_FORMAT_DIR = join(FIXTURES_DIR, 'migrations-new-format-cockroachdb')
const MYSQL_NEW_FORMAT_DIR = join(FIXTURES_DIR, 'migrations-new-format-mysql')

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

describe('detectMigrationFormat', () => {
  it('returns "journal" for legacy format with meta/_journal.json', () => {
    expect(detectMigrationFormat(PG_MIGRATIONS_DIR)).toBe('journal')
  })

  it('returns "folder" for new format without meta/_journal.json', () => {
    expect(detectMigrationFormat(PG_NEW_FORMAT_DIR)).toBe('folder')
  })
})

describe('readMigrationJournal', () => {
  it('reads and parses the journal file', () => {
    const journal = readMigrationJournal(PG_MIGRATIONS_DIR)
    expect(journal.dialect).toBe('postgresql')
    expect(journal.entries).toHaveLength(2)
    expect(journal.entries[0]!.tag).toBe('0000_init')
    expect(journal.entries[1]!.tag).toBe('0001_add_users')
  })

  it('throws when journal does not exist', () => {
    expect(() => readMigrationJournal('/nonexistent/path')).toThrow()
  })
})

describe('readMigrationEntries (legacy journal format)', () => {
  it('reads entries with computed hashes', () => {
    const entries = readMigrationEntries(PG_MIGRATIONS_DIR)
    expect(entries).toHaveLength(2)

    const initSql = readFileSync(join(PG_MIGRATIONS_DIR, '0000_init.sql'), 'utf-8')
    const expectedHash = createHash('sha256').update(initSql).digest('hex')

    expect(entries[0]!.tag).toBe('0000_init')
    expect(entries[0]!.hash).toBe(expectedHash)
    expect(entries[0]!.createdAt).toBe(1700000000000)
  })
})

describe('readMigrationEntries (new folder format)', () => {
  it('reads entries from folder-per-migration structure', () => {
    const entries = readMigrationEntries(PG_NEW_FORMAT_DIR)
    expect(entries).toHaveLength(2)

    // Tags should be folder names, sorted alphabetically (timestamp prefix ensures order)
    expect(entries[0]!.tag).toMatch(/^\d{14}_init$/)
    expect(entries[1]!.tag).toMatch(/^\d{14}_add_users$/)

    // Verify hashes match the actual migration.sql content
    const dirs = readdirSync(PG_NEW_FORMAT_DIR).sort()
    const initSql = readFileSync(join(PG_NEW_FORMAT_DIR, dirs[0]!, 'migration.sql'), 'utf-8')
    const expectedHash = createHash('sha256').update(initSql).digest('hex')
    expect(entries[0]!.hash).toBe(expectedHash)

    // createdAt should be parsed from the folder timestamp
    expect(entries[0]!.createdAt).toBeGreaterThan(0)
  })

  it('reads MySQL entries from folder-per-migration structure', () => {
    const entries = readMigrationEntries(MYSQL_NEW_FORMAT_DIR)
    expect(entries).toHaveLength(2)
    expect(entries[0]!.tag).toMatch(/^\d{14}_init$/)
    expect(entries[1]!.tag).toMatch(/^\d{14}_add_users$/)
  })
})

// ─── PostgreSQL integration tests (legacy format) ───

describe('markMigrationsApplied (PostgreSQL, legacy format)', () => {
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
    expect(rows[0]!.created_at).toBe('1700000000000') // bigint comes as string
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

// ─── PostgreSQL integration tests (new folder format) ───

describe('markMigrationsApplied (PostgreSQL, new folder format)', () => {
  const sql = postgres(getDatabaseUrl())
  const db = drizzle({ client: sql })

  const testSchema = 'drizzle_test_new'
  const testTable = '__drizzle_migrations_test_new'

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

  it('creates schema, table, and inserts all migrations from new format', async () => {
    const result = await markMigrationsApplied({
      migrationsFolder: PG_NEW_FORMAT_DIR,
      executor,
      dialect: 'postgresql',
      migrationsTable: testTable,
      migrationsSchema: testSchema,
    })

    expect(result.total).toBe(2)
    expect(result.applied).toBe(2)
    expect(result.skipped).toBe(0)
    expect(result.entries[0]!.tag).toMatch(/^\d{14}_init$/)
    expect(result.entries[1]!.tag).toMatch(/^\d{14}_add_users$/)
    expect(result.entries[0]!.status).toBe('applied')
    expect(result.entries[1]!.status).toBe('applied')

    const rows = await sql.unsafe(
      `SELECT hash, created_at FROM "${testSchema}"."${testTable}" ORDER BY id`,
    )
    expect(rows).toHaveLength(2)
    // created_at should be a parsed timestamp, not 0
    expect(Number(rows[0]!.created_at)).toBeGreaterThan(0)
  })

  it('is idempotent — skips already tracked migrations', async () => {
    await markMigrationsApplied({
      migrationsFolder: PG_NEW_FORMAT_DIR,
      executor,
      dialect: 'postgresql',
      migrationsTable: testTable,
      migrationsSchema: testSchema,
    })

    const result = await markMigrationsApplied({
      migrationsFolder: PG_NEW_FORMAT_DIR,
      executor,
      dialect: 'postgresql',
      migrationsTable: testTable,
      migrationsSchema: testSchema,
    })

    expect(result.total).toBe(2)
    expect(result.applied).toBe(0)
    expect(result.skipped).toBe(2)

    const rows = await sql.unsafe(`SELECT * FROM "${testSchema}"."${testTable}"`)
    expect(rows).toHaveLength(2)
  })

  it('auto-detects postgresql dialect from snapshot', async () => {
    const result = await markMigrationsApplied({
      migrationsFolder: PG_NEW_FORMAT_DIR,
      executor,
      migrationsTable: testTable,
      migrationsSchema: testSchema,
    })

    // snapshot.json has dialect: "postgres" which should be normalized to "postgresql"
    expect(result.applied).toBe(2)
  })
})

// ─── PostgreSQL integration tests (drizzle-kit generated new format) ───

describe('markMigrationsApplied (PostgreSQL, drizzle-kit generated)', () => {
  const sql = postgres(getDatabaseUrl())
  const db = drizzle({ client: sql })

  const testSchema = 'drizzle_test_gen'
  const testTable = '__drizzle_migrations_test_gen'
  let generatedDir: string

  const executor: SqlExecutor = {
    run: (query: string) => sql.unsafe(query).then(() => {}),
    all: (query: string) => sql.unsafe(query) as Promise<Record<string, unknown>[]>,
  }

  beforeAll(() => {
    generatedDir = generateNewFormatMigrations('postgresql')
  })

  beforeEach(async () => {
    await db.execute(`DROP TABLE IF EXISTS "${testSchema}"."${testTable}"`)
    await db.execute(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`)
  })

  afterAll(async () => {
    await db.execute(`DROP TABLE IF EXISTS "${testSchema}"."${testTable}"`)
    await db.execute(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`)
    await sql.end()
    cleanupGeneratedMigrations(generatedDir)
  })

  it('reads and applies freshly generated migrations', async () => {
    const entries = readMigrationEntries(generatedDir)
    expect(entries).toHaveLength(2)
    expect(entries[0]!.tag).toMatch(/_init$/)
    expect(entries[1]!.tag).toMatch(/_add_users$/)

    const result = await markMigrationsApplied({
      migrationsFolder: generatedDir,
      executor,
      dialect: 'postgresql',
      migrationsTable: testTable,
      migrationsSchema: testSchema,
    })

    expect(result.total).toBe(2)
    expect(result.applied).toBe(2)
    expect(result.skipped).toBe(0)

    const rows = await sql.unsafe(
      `SELECT hash, created_at FROM "${testSchema}"."${testTable}" ORDER BY id`,
    )
    expect(rows).toHaveLength(2)
  })

  it('is idempotent with generated migrations', async () => {
    await markMigrationsApplied({
      migrationsFolder: generatedDir,
      executor,
      dialect: 'postgresql',
      migrationsTable: testTable,
      migrationsSchema: testSchema,
    })

    const result = await markMigrationsApplied({
      migrationsFolder: generatedDir,
      executor,
      dialect: 'postgresql',
      migrationsTable: testTable,
      migrationsSchema: testSchema,
    })

    expect(result.applied).toBe(0)
    expect(result.skipped).toBe(2)
  })
})

// ─── CockroachDB SQL generation tests (mock executor) ───

describe('markMigrationsApplied (CockroachDB SQL generation)', () => {
  it('generates PostgreSQL-compatible SQL with double-quote quoting', async () => {
    const executedQueries: string[] = []
    const mockExecutor: SqlExecutor = {
      run: (query: string) => {
        executedQueries.push(query)
        return Promise.resolve()
      },
      all: () => Promise.resolve([]),
    }

    await markMigrationsApplied({
      migrationsFolder: COCKROACHDB_MIGRATIONS_DIR,
      executor: mockExecutor,
      dialect: 'cockroachdb',
    })

    // Should create a schema (like PostgreSQL)
    expect(executedQueries.some((q) => q.includes('CREATE SCHEMA'))).toBe(true)

    // Should use double-quote quoting for table name
    const createTable = executedQueries.find((q) => q.includes('CREATE TABLE'))
    expect(createTable).toContain('"__drizzle_migrations"')
    expect(createTable).not.toContain('`__drizzle_migrations`')

    // Should insert migration record
    const insert = executedQueries.find((q) => q.includes('INSERT'))
    expect(insert).toContain('"__drizzle_migrations"')
  })

  it('auto-detects cockroachdb dialect from journal', async () => {
    const executedQueries: string[] = []
    const mockExecutor: SqlExecutor = {
      run: (query: string) => {
        executedQueries.push(query)
        return Promise.resolve()
      },
      all: () => Promise.resolve([]),
    }

    await markMigrationsApplied({
      migrationsFolder: COCKROACHDB_MIGRATIONS_DIR,
      executor: mockExecutor,
    })

    // Should auto-detect and use PG-style quoting
    const createTable = executedQueries.find((q) => q.includes('CREATE TABLE'))
    expect(createTable).toContain('"__drizzle_migrations"')
  })
})

// ─── CockroachDB integration tests (real database) ───

describe('markMigrationsApplied (CockroachDB integration, legacy format)', () => {
  const sql = postgres(getCockroachdbDatabaseUrl())

  const testSchema = 'drizzle_test'
  const testTable = '__drizzle_migrations_test'

  const executor: SqlExecutor = {
    run: (query: string) => sql.unsafe(query).then(() => {}),
    all: (query: string) => sql.unsafe(query) as Promise<Record<string, unknown>[]>,
  }

  beforeEach(async () => {
    await sql.unsafe(`DROP TABLE IF EXISTS "${testSchema}"."${testTable}"`)
    await sql.unsafe(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`)
  })

  afterAll(async () => {
    await sql.unsafe(`DROP TABLE IF EXISTS "${testSchema}"."${testTable}"`)
    await sql.unsafe(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`)
    await sql.end()
  })

  it('creates schema, table, and inserts all migrations', async () => {
    const result = await markMigrationsApplied({
      migrationsFolder: COCKROACHDB_MIGRATIONS_DIR,
      executor,
      dialect: 'cockroachdb',
      migrationsTable: testTable,
      migrationsSchema: testSchema,
    })

    expect(result.total).toBe(1)
    expect(result.applied).toBe(1)
    expect(result.skipped).toBe(0)
    expect(result.entries).toEqual([{ tag: '0000_init', status: 'applied' }])

    // Verify rows in database
    const rows = await sql.unsafe(
      `SELECT hash, created_at FROM "${testSchema}"."${testTable}" ORDER BY id`,
    )
    expect(rows).toHaveLength(1)
  })

  it('is idempotent — skips already tracked migrations', async () => {
    await markMigrationsApplied({
      migrationsFolder: COCKROACHDB_MIGRATIONS_DIR,
      executor,
      dialect: 'cockroachdb',
      migrationsTable: testTable,
      migrationsSchema: testSchema,
    })

    const result = await markMigrationsApplied({
      migrationsFolder: COCKROACHDB_MIGRATIONS_DIR,
      executor,
      dialect: 'cockroachdb',
      migrationsTable: testTable,
      migrationsSchema: testSchema,
    })

    expect(result.total).toBe(1)
    expect(result.applied).toBe(0)
    expect(result.skipped).toBe(1)

    // Still only 1 row
    const rows = await sql.unsafe(`SELECT * FROM "${testSchema}"."${testTable}"`)
    expect(rows).toHaveLength(1)
  })
})

// ─── CockroachDB integration tests (new folder format) ───

describe('markMigrationsApplied (CockroachDB integration, new folder format)', () => {
  const sql = postgres(getCockroachdbDatabaseUrl())

  const testSchema = 'drizzle_test_new'
  const testTable = '__drizzle_migrations_test_new'

  const executor: SqlExecutor = {
    run: (query: string) => sql.unsafe(query).then(() => {}),
    all: (query: string) => sql.unsafe(query) as Promise<Record<string, unknown>[]>,
  }

  beforeEach(async () => {
    await sql.unsafe(`DROP TABLE IF EXISTS "${testSchema}"."${testTable}"`)
    await sql.unsafe(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`)
  })

  afterAll(async () => {
    await sql.unsafe(`DROP TABLE IF EXISTS "${testSchema}"."${testTable}"`)
    await sql.unsafe(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`)
    await sql.end()
  })

  it('creates schema, table, and inserts all migrations from new format', async () => {
    const result = await markMigrationsApplied({
      migrationsFolder: COCKROACHDB_NEW_FORMAT_DIR,
      executor,
      dialect: 'cockroachdb',
      migrationsTable: testTable,
      migrationsSchema: testSchema,
    })

    expect(result.total).toBe(2)
    expect(result.applied).toBe(2)
    expect(result.skipped).toBe(0)

    const rows = await sql.unsafe(
      `SELECT hash, created_at FROM "${testSchema}"."${testTable}" ORDER BY id`,
    )
    expect(rows).toHaveLength(2)
  })

  it('is idempotent with new format', async () => {
    await markMigrationsApplied({
      migrationsFolder: COCKROACHDB_NEW_FORMAT_DIR,
      executor,
      dialect: 'cockroachdb',
      migrationsTable: testTable,
      migrationsSchema: testSchema,
    })

    const result = await markMigrationsApplied({
      migrationsFolder: COCKROACHDB_NEW_FORMAT_DIR,
      executor,
      dialect: 'cockroachdb',
      migrationsTable: testTable,
      migrationsSchema: testSchema,
    })

    expect(result.applied).toBe(0)
    expect(result.skipped).toBe(2)
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

// ─── MySQL SQL generation tests (new folder format, mock executor) ───

describe('markMigrationsApplied (MySQL SQL generation, new folder format)', () => {
  it('generates MySQL-compatible SQL from new format folders', async () => {
    const executedQueries: string[] = []
    const mockExecutor: SqlExecutor = {
      run: (query: string) => {
        executedQueries.push(query)
        return Promise.resolve()
      },
      all: () => Promise.resolve([]),
    }

    await markMigrationsApplied({
      migrationsFolder: MYSQL_NEW_FORMAT_DIR,
      executor: mockExecutor,
      dialect: 'mysql',
    })

    expect(executedQueries.some((q) => q.includes('CREATE SCHEMA'))).toBe(false)

    const createTable = executedQueries.find((q) => q.includes('CREATE TABLE'))
    expect(createTable).toContain('`__drizzle_migrations`')

    const inserts = executedQueries.filter((q) => q.includes('INSERT'))
    expect(inserts).toHaveLength(2)
  })

  it('auto-detects mysql dialect from snapshot.json', async () => {
    const executedQueries: string[] = []
    const mockExecutor: SqlExecutor = {
      run: (query: string) => {
        executedQueries.push(query)
        return Promise.resolve()
      },
      all: () => Promise.resolve([]),
    }

    // No explicit dialect — should read from snapshot.json
    await markMigrationsApplied({
      migrationsFolder: MYSQL_NEW_FORMAT_DIR,
      executor: mockExecutor,
    })

    const createTable = executedQueries.find((q) => q.includes('CREATE TABLE'))
    expect(createTable).toContain('`__drizzle_migrations`')
  })
})

// ─── MySQL integration tests (real database, legacy format) ───

describe('markMigrationsApplied (MySQL integration, legacy format)', () => {
  const testTable = '__drizzle_migrations_test'
  const pool = mysql.createPool(getMysqlDatabaseUrl())

  const executor: SqlExecutor = {
    run: (query: string) => pool.execute(query).then(() => {}),
    all: (query: string) => pool.execute(query).then(([rows]) => rows as Record<string, unknown>[]),
  }

  beforeEach(async () => {
    await pool.execute(`DROP TABLE IF EXISTS \`${testTable}\``)
  })

  afterAll(async () => {
    await pool.execute(`DROP TABLE IF EXISTS \`${testTable}\``)
    await pool.end()
  })

  it('creates table and inserts all migrations', async () => {
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
    const [rows] = await pool.execute(`SELECT hash, created_at FROM \`${testTable}\``)
    expect(rows).toHaveLength(1)
  })

  it('is idempotent — skips already tracked migrations', async () => {
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
    const [rows] = await pool.execute(`SELECT * FROM \`${testTable}\``)
    expect(rows).toHaveLength(1)
  })
})

// ─── MySQL integration tests (real database, new folder format) ───

describe('markMigrationsApplied (MySQL integration, new folder format)', () => {
  const testTable = '__drizzle_migrations_test_new'
  const pool = mysql.createPool(getMysqlDatabaseUrl())

  const executor: SqlExecutor = {
    run: (query: string) => pool.execute(query).then(() => {}),
    all: (query: string) => pool.execute(query).then(([rows]) => rows as Record<string, unknown>[]),
  }

  beforeEach(async () => {
    await pool.execute(`DROP TABLE IF EXISTS \`${testTable}\``)
  })

  afterAll(async () => {
    await pool.execute(`DROP TABLE IF EXISTS \`${testTable}\``)
    await pool.end()
  })

  it('creates table and inserts all migrations from new format', async () => {
    const result = await markMigrationsApplied({
      migrationsFolder: MYSQL_NEW_FORMAT_DIR,
      executor,
      dialect: 'mysql',
      migrationsTable: testTable,
    })

    expect(result.total).toBe(2)
    expect(result.applied).toBe(2)
    expect(result.skipped).toBe(0)
    expect(result.entries[0]!.tag).toMatch(/^\d{14}_init$/)
    expect(result.entries[1]!.tag).toMatch(/^\d{14}_add_users$/)
  })

  it('is idempotent with new format', async () => {
    await markMigrationsApplied({
      migrationsFolder: MYSQL_NEW_FORMAT_DIR,
      executor,
      dialect: 'mysql',
      migrationsTable: testTable,
    })

    const result = await markMigrationsApplied({
      migrationsFolder: MYSQL_NEW_FORMAT_DIR,
      executor,
      dialect: 'mysql',
      migrationsTable: testTable,
    })

    expect(result.applied).toBe(0)
    expect(result.skipped).toBe(2)

    const [rows] = await pool.execute(`SELECT * FROM \`${testTable}\``)
    expect(rows).toHaveLength(2)
  })
})

// ─── MySQL integration tests (drizzle-kit generated new format) ───

describe('markMigrationsApplied (MySQL, drizzle-kit generated)', () => {
  const testTable = '__drizzle_migrations_test_gen'
  const pool = mysql.createPool(getMysqlDatabaseUrl())
  let generatedDir: string

  const executor: SqlExecutor = {
    run: (query: string) => pool.execute(query).then(() => {}),
    all: (query: string) => pool.execute(query).then(([rows]) => rows as Record<string, unknown>[]),
  }

  beforeAll(() => {
    generatedDir = generateNewFormatMigrations('mysql')
  })

  beforeEach(async () => {
    await pool.execute(`DROP TABLE IF EXISTS \`${testTable}\``)
  })

  afterAll(async () => {
    await pool.execute(`DROP TABLE IF EXISTS \`${testTable}\``)
    await pool.end()
    cleanupGeneratedMigrations(generatedDir)
  })

  it('reads and applies freshly generated MySQL migrations', async () => {
    const entries = readMigrationEntries(generatedDir)
    expect(entries).toHaveLength(2)
    expect(entries[0]!.tag).toMatch(/_init$/)
    expect(entries[1]!.tag).toMatch(/_add_users$/)

    const result = await markMigrationsApplied({
      migrationsFolder: generatedDir,
      executor,
      dialect: 'mysql',
      migrationsTable: testTable,
    })

    expect(result.total).toBe(2)
    expect(result.applied).toBe(2)
    expect(result.skipped).toBe(0)
  })

  it('is idempotent with generated MySQL migrations', async () => {
    await markMigrationsApplied({
      migrationsFolder: generatedDir,
      executor,
      dialect: 'mysql',
      migrationsTable: testTable,
    })

    const result = await markMigrationsApplied({
      migrationsFolder: generatedDir,
      executor,
      dialect: 'mysql',
      migrationsTable: testTable,
    })

    expect(result.applied).toBe(0)
    expect(result.skipped).toBe(2)
  })
})
