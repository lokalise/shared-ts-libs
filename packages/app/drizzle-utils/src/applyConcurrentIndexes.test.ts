import { join, resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDatabaseUrl } from '../test/getDatabaseUrl.ts'
import { applyConcurrentIndexes, readConcurrentIndexStatements } from './applyConcurrentIndexes.ts'

const FIXTURES_DIR = resolve(__dirname, '../test/fixtures')
const INDEX_FOLDER = join(FIXTURES_DIR, 'concurrent-indexes')
const INVALID_INDEX_FOLDER = join(FIXTURES_DIR, 'concurrent-indexes-invalid')

describe('readConcurrentIndexStatements', () => {
  it('reads statements from every file in name order', () => {
    expect(readConcurrentIndexStatements(INDEX_FOLDER)).toMatchObject([
      {
        file: '0001_aci_item_owner.sql',
        indexName: 'idx_aci_item_owner',
        tableName: '"aci"."aci_item"',
      },
      { file: '0002_aci_item_code.sql', indexName: 'idx_aci_item_code', tableName: 'aci.aci_item' },
      {
        file: '0002_aci_item_code.sql',
        indexName: 'idx_aci_missing_owner',
        tableName: '"aci"."aci_missing"',
      },
    ])
  })

  it('rejects statements that are not idempotent concurrent index builds', () => {
    expect(() => readConcurrentIndexStatements(INVALID_INDEX_FOLDER)).toThrow(
      '0001_plain_index.sql: expected "CREATE [UNIQUE] INDEX CONCURRENTLY IF NOT EXISTS',
    )
  })
})

describe('applyConcurrentIndexes (PostgreSQL)', () => {
  const sql = postgres(getDatabaseUrl())
  const db = drizzle({ client: sql })

  const readIndexValidity = async () => {
    const rows = await sql.unsafe<{ relname: string; indisvalid: boolean }[]>(
      `SELECT c.relname, i.indisvalid
         FROM pg_index i
         JOIN pg_class c ON c.oid = i.indexrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'aci' AND c.relname LIKE 'idx_%'`,
    )
    return Object.fromEntries(rows.map((row) => [row.relname, row.indisvalid]))
  }

  beforeEach(async () => {
    await sql.unsafe('DROP SCHEMA IF EXISTS aci CASCADE')
    await sql.unsafe('CREATE SCHEMA aci')
    await sql.unsafe(
      'CREATE TABLE aci.aci_item (id integer PRIMARY KEY, owner_id integer, code text)',
    )
  })

  afterAll(async () => {
    await sql.unsafe('DROP SCHEMA IF EXISTS aci CASCADE')
    await sql.end()
  })

  it('builds missing indexes and skips those whose table does not exist yet', async () => {
    const result = await applyConcurrentIndexes({ db, folder: INDEX_FOLDER })

    expect(result).toEqual({
      created: ['idx_aci_item_owner', 'idx_aci_item_code'],
      rebuilt: [],
      existing: [],
      missingTable: ['idx_aci_missing_owner'],
    })
    expect(await readIndexValidity()).toEqual({ idx_aci_item_owner: true, idx_aci_item_code: true })
  })

  it('is idempotent', async () => {
    await applyConcurrentIndexes({ db, folder: INDEX_FOLDER })

    const result = await applyConcurrentIndexes({ db, folder: INDEX_FOLDER })

    expect(result).toEqual({
      created: [],
      rebuilt: [],
      existing: ['idx_aci_item_owner', 'idx_aci_item_code'],
      missingTable: ['idx_aci_missing_owner'],
    })
  })

  it('skips every index on a fresh database', async () => {
    await sql.unsafe('DROP SCHEMA aci CASCADE')

    const result = await applyConcurrentIndexes({ db, folder: INDEX_FOLDER })

    expect(result.missingTable).toEqual([
      'idx_aci_item_owner',
      'idx_aci_item_code',
      'idx_aci_missing_owner',
    ])
  })

  it('drops and rebuilds an INVALID index left by a failed build', async () => {
    await sql.unsafe(`INSERT INTO aci.aci_item (id, owner_id, code) VALUES (1, 1, 'a'), (2, 2, 'a')`)

    await expect(applyConcurrentIndexes({ db, folder: INDEX_FOLDER })).rejects.toThrow(
      'could not create unique index',
    )
    expect(await readIndexValidity()).toEqual({
      idx_aci_item_owner: true,
      idx_aci_item_code: false,
    })

    await sql.unsafe('DELETE FROM aci.aci_item WHERE id = 2')
    const result = await applyConcurrentIndexes({ db, folder: INDEX_FOLDER })

    expect(result).toEqual({
      created: [],
      rebuilt: ['idx_aci_item_code'],
      existing: ['idx_aci_item_owner'],
      missingTable: ['idx_aci_missing_owner'],
    })
    expect(await readIndexValidity()).toEqual({ idx_aci_item_owner: true, idx_aci_item_code: true })
  })

  it('fails without dropping an index another session is still building', async () => {
    let releaseWriter = () => {}
    const writerReleased = new Promise<void>((resolve) => {
      releaseWriter = resolve
    })
    let markInserted = () => {}
    const inserted = new Promise<void>((resolve) => {
      markInserted = resolve
    })
    const writer = sql.begin(async (tx) => {
      await tx.unsafe(`INSERT INTO aci.aci_item (id, owner_id, code) VALUES (1, 1, 'a')`)
      markInserted()
      await writerReleased
    })
    await inserted

    const builder = postgres(getDatabaseUrl(), { max: 1 })
    const build = builder.unsafe(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_aci_item_owner" ON "aci"."aci_item" ("owner_id")',
    )

    await vi.waitFor(
      async () => {
        const rows = await sql.unsafe(
          `SELECT 1 FROM pg_stat_progress_create_index p
             JOIN pg_class c ON c.oid = p.index_relid
            WHERE c.relname = 'idx_aci_item_owner'`,
        )
        expect(rows).toHaveLength(1)
      },
      { timeout: 10_000, interval: 100 },
    )

    await expect(applyConcurrentIndexes({ db, folder: INDEX_FOLDER })).rejects.toThrow(
      'aci.idx_aci_item_owner is being built by backend',
    )

    releaseWriter()
    await writer
    await build
    await builder.end()
    expect(await readIndexValidity()).toEqual({ idx_aci_item_owner: true })
  })

  it('runs nothing when any statement is invalid', async () => {
    await expect(applyConcurrentIndexes({ db, folder: INVALID_INDEX_FOLDER })).rejects.toThrow(
      '0001_plain_index.sql',
    )
    expect(await readIndexValidity()).toEqual({})
  })
})
