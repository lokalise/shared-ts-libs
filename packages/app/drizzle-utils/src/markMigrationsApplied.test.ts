import { join, resolve } from 'node:path'
import { drizzle as drizzleMysql } from 'drizzle-orm/mysql2'
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js'
import mysql from 'mysql2/promise'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { getCockroachdbDatabaseUrl } from '../test/getCockroachdbDatabaseUrl.ts'
import { getDatabaseUrl } from '../test/getDatabaseUrl.ts'
import { getMysqlDatabaseUrl } from '../test/getMysqlDatabaseUrl.ts'
import { type DrizzleExecutor, markMigrationsApplied } from './markMigrationsApplied.ts'

const FIXTURES_DIR = resolve(__dirname, '../test/fixtures')
const PG_NEW_FORMAT_DIR = join(FIXTURES_DIR, 'migrations-new-format')
const COCKROACHDB_NEW_FORMAT_DIR = join(FIXTURES_DIR, 'migrations-new-format-cockroachdb')
const MYSQL_NEW_FORMAT_DIR = join(FIXTURES_DIR, 'migrations-new-format-mysql')

// The two folder-per-migration fixtures both name their migrations identically.
const EXPECTED_MIGRATION_NAMES = ['20260328163300_init', '20260328163325_add_users']
const MYSQL_EXPECTED_MIGRATION_NAMES = ['20260328163343_init', '20260328163417_add_users']

// ─── PostgreSQL (real database) ───

describe('markMigrationsApplied (PostgreSQL)', () => {
  const sql = postgres(getDatabaseUrl())
  const db = drizzlePg({ client: sql })

  const migrationsTable = '__drizzle_migrations_mdm_pg'
  const legacyProbeTable = 'mdm_legacy_probe_pg'
  // The tracking table lands in the default `drizzle` schema (matching what
  // drizzle-kit migrate expects), so reads/drops are qualified accordingly.
  const qualifiedTable = `"drizzle"."${migrationsTable}"`

  const readRows = () =>
    sql.unsafe(`SELECT hash, created_at, name FROM ${qualifiedTable} ORDER BY id`)

  beforeEach(async () => {
    await db.execute(`DROP TABLE IF EXISTS ${qualifiedTable}`)
    await db.execute(`DROP TABLE IF EXISTS "${legacyProbeTable}"`)
  })

  afterAll(async () => {
    await db.execute(`DROP TABLE IF EXISTS ${qualifiedTable}`)
    await db.execute(`DROP TABLE IF EXISTS "${legacyProbeTable}"`)
    await sql.end()
  })

  it('skips baselining when the legacy probe table is absent (fresh database)', async () => {
    const result = await markMigrationsApplied({
      db,
      dialect: 'postgresql',
      migrationsFolder: PG_NEW_FORMAT_DIR,
      legacySchemaProbeTable: legacyProbeTable,
      migrationsTable,
    })

    expect(result).toEqual({ outcome: 'skipped-fresh', total: 0, applied: 0, skipped: 0 })

    // No migrations table was created.
    const exists = await sql.unsafe(
      `SELECT 1 FROM information_schema.tables WHERE table_name = '${migrationsTable}'`,
    )
    expect(exists).toHaveLength(0)
  })

  it('baselines an existing (pre-Drizzle) database, populating the name column', async () => {
    await db.execute(`CREATE TABLE "${legacyProbeTable}" (id integer PRIMARY KEY)`)

    const result = await markMigrationsApplied({
      db,
      dialect: 'postgresql',
      migrationsFolder: PG_NEW_FORMAT_DIR,
      legacySchemaProbeTable: legacyProbeTable,
      migrationsTable,
    })

    expect(result.outcome).toBe('baselined')
    expect(result.total).toBe(2)
    expect(result.applied).toBe(2)
    expect(result.skipped).toBe(0)

    const rows = await readRows()
    expect(rows.map((r) => r.name)).toEqual(EXPECTED_MIGRATION_NAMES)
    for (const row of rows) {
      expect(String(row.hash)).toMatch(/^[0-9a-f]{64}$/)
      expect(Number(row.created_at)).toBeGreaterThan(0)
    }
  })

  it('is idempotent — already-recorded migrations are skipped', async () => {
    await db.execute(`CREATE TABLE "${legacyProbeTable}" (id integer PRIMARY KEY)`)

    await markMigrationsApplied({
      db,
      dialect: 'postgresql',
      migrationsFolder: PG_NEW_FORMAT_DIR,
      legacySchemaProbeTable: legacyProbeTable,
      migrationsTable,
    })

    const result = await markMigrationsApplied({
      db,
      dialect: 'postgresql',
      migrationsFolder: PG_NEW_FORMAT_DIR,
      legacySchemaProbeTable: legacyProbeTable,
      migrationsTable,
    })

    expect(result.outcome).toBe('baselined')
    expect(result.applied).toBe(0)
    expect(result.skipped).toBe(2)

    const rows = await readRows()
    expect(rows).toHaveLength(2)
  })

  it('tops up only the missing rows when a new baseline migration is added', async () => {
    await db.execute(`CREATE TABLE "${legacyProbeTable}" (id integer PRIMARY KEY)`)

    // Simulate a database baselined before the second migration existed: create
    // the tracking table with only the first migration recorded.
    await db.execute(`CREATE SCHEMA IF NOT EXISTS "drizzle"`)
    await db.execute(
      `CREATE TABLE ${qualifiedTable} (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint, name text)`,
    )
    await db.execute(
      `INSERT INTO ${qualifiedTable} (hash, created_at, name) VALUES ('deadbeef', 1, '${EXPECTED_MIGRATION_NAMES[0]}')`,
    )

    const result = await markMigrationsApplied({
      db,
      dialect: 'postgresql',
      migrationsFolder: PG_NEW_FORMAT_DIR,
      legacySchemaProbeTable: legacyProbeTable,
      migrationsTable,
    })

    expect(result.applied).toBe(1)
    expect(result.skipped).toBe(1)

    const rows = await readRows()
    expect(rows.map((r) => r.name)).toEqual(EXPECTED_MIGRATION_NAMES)
  })

  it('baselines without a probe table when legacySchemaProbeTable is omitted', async () => {
    const result = await markMigrationsApplied({
      db,
      dialect: 'postgresql',
      migrationsFolder: PG_NEW_FORMAT_DIR,
      migrationsTable,
    })

    expect(result.outcome).toBe('baselined')
    expect(result.applied).toBe(2)
  })
})

// ─── CockroachDB (real database) ───

describe('markMigrationsApplied (CockroachDB)', () => {
  const sql = postgres(getCockroachdbDatabaseUrl())
  const db = drizzlePg({ client: sql })

  const migrationsTable = '__drizzle_migrations_mdm_crdb'
  const legacyProbeTable = 'mdm_legacy_probe_crdb'
  const qualifiedTable = `"drizzle"."${migrationsTable}"`

  beforeEach(async () => {
    await db.execute(`DROP TABLE IF EXISTS ${qualifiedTable}`)
    await db.execute(`DROP TABLE IF EXISTS "${legacyProbeTable}"`)
  })

  afterAll(async () => {
    await db.execute(`DROP TABLE IF EXISTS ${qualifiedTable}`)
    await db.execute(`DROP TABLE IF EXISTS "${legacyProbeTable}"`)
    await sql.end()
  })

  it('skips baselining on a fresh database', async () => {
    const result = await markMigrationsApplied({
      db,
      dialect: 'cockroachdb',
      migrationsFolder: COCKROACHDB_NEW_FORMAT_DIR,
      legacySchemaProbeTable: legacyProbeTable,
      migrationsTable,
    })

    expect(result.outcome).toBe('skipped-fresh')
  })

  it('baselines an existing database with name column populated', async () => {
    await db.execute(`CREATE TABLE "${legacyProbeTable}" (id integer PRIMARY KEY)`)

    const result = await markMigrationsApplied({
      db,
      dialect: 'cockroachdb',
      migrationsFolder: COCKROACHDB_NEW_FORMAT_DIR,
      legacySchemaProbeTable: legacyProbeTable,
      migrationsTable,
    })

    expect(result.outcome).toBe('baselined')
    expect(result.applied).toBe(2)

    const rows = await sql.unsafe(`SELECT name FROM ${qualifiedTable} ORDER BY id`)
    expect(rows.map((r) => r.name)).toEqual(EXPECTED_MIGRATION_NAMES)
  })
})

// ─── MySQL (real database) ───

describe('markMigrationsApplied (MySQL)', () => {
  const pool = mysql.createPool(getMysqlDatabaseUrl())
  const db = drizzleMysql({ client: pool })

  const migrationsTable = '__drizzle_migrations_mdm_mysql'
  const legacyProbeTable = 'mdm_legacy_probe_mysql'

  beforeEach(async () => {
    await pool.execute(`DROP TABLE IF EXISTS \`${migrationsTable}\``)
    await pool.execute(`DROP TABLE IF EXISTS \`${legacyProbeTable}\``)
  })

  afterAll(async () => {
    await pool.execute(`DROP TABLE IF EXISTS \`${migrationsTable}\``)
    await pool.execute(`DROP TABLE IF EXISTS \`${legacyProbeTable}\``)
    await pool.end()
  })

  it('skips baselining on a fresh database', async () => {
    const result = await markMigrationsApplied({
      db,
      dialect: 'mysql',
      migrationsFolder: MYSQL_NEW_FORMAT_DIR,
      legacySchemaProbeTable: legacyProbeTable,
      migrationsTable,
    })

    expect(result.outcome).toBe('skipped-fresh')

    const [rows] = await pool.execute(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '${migrationsTable}'`,
    )
    expect(rows as unknown[]).toHaveLength(0)
  })

  it('baselines an existing database, populating the name column', async () => {
    await pool.execute(`CREATE TABLE \`${legacyProbeTable}\` (id int PRIMARY KEY)`)

    const result = await markMigrationsApplied({
      db,
      dialect: 'mysql',
      migrationsFolder: MYSQL_NEW_FORMAT_DIR,
      legacySchemaProbeTable: legacyProbeTable,
      migrationsTable,
    })

    expect(result.outcome).toBe('baselined')
    expect(result.total).toBe(2)
    expect(result.applied).toBe(2)

    const [rows] = await pool.execute(`SELECT hash, created_at, name FROM \`${migrationsTable}\``)
    const records = rows as Array<{ hash: string; created_at: number; name: string }>
    expect(records.map((r) => r.name).sort()).toEqual(MYSQL_EXPECTED_MIGRATION_NAMES)
    for (const record of records) {
      expect(String(record.hash)).toMatch(/^[0-9a-f]{64}$/)
      expect(Number(record.created_at)).toBeGreaterThan(0)
    }
  })

  it('is idempotent — re-running skips already recorded migrations', async () => {
    await pool.execute(`CREATE TABLE \`${legacyProbeTable}\` (id int PRIMARY KEY)`)

    await markMigrationsApplied({
      db,
      dialect: 'mysql',
      migrationsFolder: MYSQL_NEW_FORMAT_DIR,
      legacySchemaProbeTable: legacyProbeTable,
      migrationsTable,
    })

    const result = await markMigrationsApplied({
      db,
      dialect: 'mysql',
      migrationsFolder: MYSQL_NEW_FORMAT_DIR,
      legacySchemaProbeTable: legacyProbeTable,
      migrationsTable,
    })

    expect(result.applied).toBe(0)
    expect(result.skipped).toBe(2)

    const [rows] = await pool.execute(`SELECT * FROM \`${migrationsTable}\``)
    expect(rows as unknown[]).toHaveLength(2)
  })

  it('creates the database via ensureDatabaseExists for MySQL', async () => {
    const dbName = 'mdm_ensure_db_test'
    await pool.execute(`DROP DATABASE IF EXISTS \`${dbName}\``)
    try {
      await markMigrationsApplied({
        db,
        dialect: 'mysql',
        migrationsFolder: MYSQL_NEW_FORMAT_DIR,
        databaseName: dbName,
        // No probe table in the (new, empty) DB -> baseline is skipped, but the
        // CREATE DATABASE side effect is what we assert on.
        legacySchemaProbeTable: 'definitely_missing_table',
        migrationsTable,
      })

      const [rows] = await pool.execute(
        `SELECT schema_name FROM information_schema.schemata WHERE schema_name = '${dbName}'`,
      )
      expect(rows as unknown[]).toHaveLength(1)
    } finally {
      await pool.execute(`DROP DATABASE IF EXISTS \`${dbName}\``)
    }
  })
})

// ─── Driver-agnostic behaviour (no real database) ───

describe('markMigrationsApplied (no migrations)', () => {
  it('returns skipped-no-migrations for an empty migrations folder', async () => {
    const { mkdtempSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const emptyDir = mkdtempSync(join(tmpdir(), 'mdm-empty-'))

    const executed: string[] = []
    const fakeDb: DrizzleExecutor = {
      execute: (query) => {
        executed.push(String((query as { sql?: unknown }).sql ?? query))
        return Promise.resolve([])
      },
    }

    const result = await markMigrationsApplied({
      db: fakeDb,
      dialect: 'postgresql',
      migrationsFolder: emptyDir,
    })

    expect(result).toEqual({ outcome: 'skipped-no-migrations', total: 0, applied: 0, skipped: 0 })
    // No queries should have run when there are no migrations and no probe/db options.
    expect(executed).toHaveLength(0)
  })
})
