import type { SQL } from 'drizzle-orm'
import {
  bigint,
  boolean,
  jsonb,
  PgDialect,
  pgSchema,
  pgTable,
  smallint,
  timestamp,
} from 'drizzle-orm/pg-core'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { getDatabaseUrl } from '../test/getDatabaseUrl.ts'
import { drizzleFullBulkUpdate } from './drizzleFullBulkUpdate.ts'

const sql = postgres(getDatabaseUrl())
const db = drizzle({ client: sql })

/**
 * A database that records the statement instead of running it, so a test can
 * assert the generated SQL. Whitespace is collapsed to keep expectations readable.
 */
const createCapturingDb = () => {
  const dialect = new PgDialect()
  const captured: { text?: string; params?: unknown[] } = {}
  const capturingDb = {
    execute: (query: SQL) => {
      const rendered = dialect.sqlToQuery(query)
      captured.text = rendered.sql.replace(/\s+/g, ' ').trim()
      captured.params = rendered.params
      return Promise.resolve([])
    },
  } as unknown as PostgresJsDatabase
  return { capturingDb, captured }
}

describe('drizzleFullBulkUpdate', () => {
  const surrogateTableName = 'updates'
  const surrogateTable = pgTable(surrogateTableName, {
    id: smallint(),
    col1: smallint(),
    col2: smallint(),
  })

  const surrogateJsonTableName = 'test_surrogate_json'
  const surrogateJsonTable = pgTable(surrogateJsonTableName, {
    id: smallint(),
    json_data: jsonb(),
  })

  const compositeTableName = 'test_composite'
  const compositeTable = pgTable(compositeTableName, {
    id1: smallint(),
    id2: smallint(),
    col1: smallint(),
    col2: smallint(),
  })

  const enumSchema = 'enum_schema'

  const standardStatusEnumName = 'standard_status'
  const standardStatusEnum = pgSchema(enumSchema).enum(standardStatusEnumName, [
    'active',
    'inactive',
  ])

  const standardEnumTableName = 'test_standard_enum'
  const standardEnumTable = pgTable(standardEnumTableName, {
    id: smallint(),
    status: standardStatusEnum(),
  })

  const ObjectStatusEnum = { ACTIVE: 'active', INACTIVE: 'inactive' } as const
  const objectStatusEnumName = 'object_status'
  const objectStatusDbEnum = pgSchema(enumSchema).enum(objectStatusEnumName, ObjectStatusEnum)

  const objectEnumTableName = 'test_object_enum'
  const objectEnumTable = pgTable(objectEnumTableName, {
    id: smallint(),
    status: objectStatusDbEnum(),
  })

  const timestampTableName = 'test_timestamp'
  const timestampTable = pgTable(timestampTableName, {
    id: smallint(),
    updated_at: timestamp({ withTimezone: true }),
  })

  beforeAll(async () => {
    await db.execute(
      `DROP TABLE IF EXISTS ${surrogateTableName}, ${surrogateJsonTableName}, ${compositeTableName}, ${standardEnumTableName}, ${objectEnumTableName}, ${timestampTableName}`,
    )
    await db.execute(`DROP TYPE IF EXISTS ${enumSchema}.${standardStatusEnumName}`)
    await db.execute(`DROP TYPE IF EXISTS ${enumSchema}.${objectStatusEnumName}`)

    await db.execute(`CREATE SCHEMA IF NOT EXISTS ${enumSchema}`)
    await db.execute(
      `CREATE TYPE ${enumSchema}.${standardStatusEnumName} AS ENUM ('active', 'inactive')`,
    )
    await db.execute(
      `CREATE TYPE ${enumSchema}.${objectStatusEnumName} AS ENUM ('active', 'inactive')`,
    )

    await Promise.all([
      db.execute(
        `CREATE TABLE ${surrogateTableName} (id smallint, col1 smallint unique, col2 smallint)`,
      ),
      db.execute(`CREATE TABLE ${surrogateJsonTableName} (id smallint, json_data jsonb)`),
      db.execute(
        `CREATE TABLE ${compositeTableName} (id1 smallint, id2 smallint, col1 smallint, col2 smallint)`,
      ),
      db.execute(
        `CREATE TABLE ${standardEnumTableName} (id smallint, status ${enumSchema}.${standardStatusEnumName})`,
      ),
      db.execute(
        `CREATE TABLE ${objectEnumTableName} (id smallint, status ${enumSchema}.${objectStatusEnumName})`,
      ),
      db.execute(`CREATE TABLE ${timestampTableName} (id smallint, updated_at timestamptz)`),
    ])
  })

  afterEach(async () => {
    await Promise.all([
      db.delete(surrogateTable),
      db.delete(surrogateJsonTable),
      db.delete(compositeTable),
      db.delete(standardEnumTable),
      db.delete(objectEnumTable),
      db.delete(timestampTable),
    ])
  })

  afterAll(async () => {
    await sql.end()
  })

  it('throws an error if entries array is empty', async () => {
    await expect(() => drizzleFullBulkUpdate(db, surrogateTable, [])).rejects.toThrowError(
      'Entries array must not be empty',
    )
  })

  it('throws an error if any where is empty', async () => {
    await expect(() =>
      drizzleFullBulkUpdate(db, surrogateTable, [{ where: {}, data: { col1: 1 } }]),
    ).rejects.toThrowError('Entry "where" object must not be empty')
  })

  it('throws an error if any data is empty', async () => {
    await expect(() =>
      drizzleFullBulkUpdate(db, surrogateTable, [{ where: { id: 1 }, data: {} }]),
    ).rejects.toThrowError('Entry "data" object must not be empty')
  })

  it('throws an error if amount of where columns are different', async () => {
    await expect(() =>
      drizzleFullBulkUpdate(db, compositeTable, [
        { where: { id1: 1 }, data: { col1: 1 } },
        { where: { id1: 2, id2: 2 }, data: { col1: 2 } },
      ]),
    ).rejects.toThrowError(`Mismatch in 'where' columns. Expected [id1], got [id1,id2]`)
  })

  it('throws an error if amount of data columns are different', async () => {
    await expect(() =>
      drizzleFullBulkUpdate(db, compositeTable, [
        { where: { id1: 1 }, data: { col1: 1 } },
        { where: { id1: 2 }, data: { col1: 2, col2: 2 } },
      ]),
    ).rejects.toThrowError(`Mismatch in 'data' columns. Expected [col1], got [col1,col2]`)
  })

  it('throws an error if where columns are different', async () => {
    await expect(() =>
      drizzleFullBulkUpdate(db, compositeTable, [
        { where: { id1: 1 }, data: { col1: 1 } },
        { where: { id2: 2 }, data: { col1: 2 } },
      ]),
    ).rejects.toThrowError(`Mismatch in 'where' columns. Expected [id1], got [id2]`)
  })

  it('throws an error if data columns are different', async () => {
    await expect(() =>
      drizzleFullBulkUpdate(db, compositeTable, [
        { where: { id1: 1 }, data: { col1: 1 } },
        { where: { id1: 2 }, data: { col2: 2 } },
      ]),
    ).rejects.toThrowError(`Mismatch in 'data' columns. Expected [col1], got [col2]`)
  })

  it('throws an error if column does not exist in table', async () => {
    await expect(() =>
      drizzleFullBulkUpdate(db, surrogateTable, [
        { where: { nonexistent_column: 1 } as any, data: { col1: 5 } },
      ]),
    ).rejects.toThrowError(`Column "nonexistent_column" could not be mapped to table`)
  })

  it('partially updates rows with surrogate key', async () => {
    await db.execute(
      `INSERT INTO ${surrogateTableName} (id, col1, col2) values (1, 1, 1), (2, 2, 2), (3, 3, 3)`,
    )

    await drizzleFullBulkUpdate(db, surrogateTable, [
      { where: { id: 1 }, data: { col1: 5, col2: 9 } },
      { where: { id: 2 }, data: { col1: 6, col2: 7 } },
    ])

    const updatedData = await db.execute(`SELECT * FROM ${surrogateTableName}`)

    expect(updatedData).toEqual(
      expect.arrayContaining([
        { id: 1, col1: 5, col2: 9 },
        { id: 2, col1: 6, col2: 7 },
        { id: 3, col1: 3, col2: 3 },
      ]),
    )
  })

  it('partially updates rows with composite key', async () => {
    await db.execute(
      `INSERT INTO ${compositeTableName} (id1, id2, col1, col2) values (1, 1, 1, 1), (2, 2, 2, 2), (3, 3, 3, 3)`,
    )

    await drizzleFullBulkUpdate(db, compositeTable, [
      { where: { id1: 1, id2: 1 }, data: { col1: 5, col2: 8 } },
      { where: { id1: 2, id2: 2 }, data: { col1: 6, col2: 7 } },
    ])

    const updatedData = await db.execute(`SELECT * FROM ${compositeTableName}`)

    expect(updatedData).toEqual(
      expect.arrayContaining([
        { id1: 1, id2: 1, col1: 5, col2: 8 },
        { id1: 2, id2: 2, col1: 6, col2: 7 },
        { id1: 3, id2: 3, col1: 3, col2: 3 },
      ]),
    )
  })

  it('updates the same row concurrently', async () => {
    await db.execute(
      `INSERT INTO ${surrogateTableName} (id, col1, col2) values (1, 1, 1), (2, 2, 2), (3, 3, 3)`,
    )

    await Promise.all([
      drizzleFullBulkUpdate(db, surrogateTable, [
        { where: { id: 1 }, data: { col1: 5 } },
        { where: { id: 2 }, data: { col1: 6 } },
      ]),
      drizzleFullBulkUpdate(db, surrogateTable, [
        { where: { id: 2 }, data: { col2: 7 } },
        { where: { id: 3 }, data: { col2: 9 } },
      ]),
    ])

    const updatedData = await db.execute(`SELECT * FROM ${surrogateTableName}`)

    expect(updatedData).toEqual(
      expect.arrayContaining([
        { id: 1, col1: 5, col2: 1 },
        { id: 2, col1: 6, col2: 7 },
        { id: 3, col1: 3, col2: 9 },
      ]),
    )
  })

  it('rollbacks the whole bulk update in case of conflict error', async () => {
    await db.execute(
      `INSERT INTO ${surrogateTableName} (id, col1, col2) values (1, 1, 1), (2, 2, 2), (3, 3, 3)`,
    )

    await expect(() =>
      drizzleFullBulkUpdate(db, surrogateTable, [
        { where: { id: 1 }, data: { col1: 5 } },
        { where: { id: 2 }, data: { col1: 3 } },
      ]),
    ).rejects.toThrowError()

    const updatedData = await db.execute(`SELECT * FROM ${surrogateTableName}`)

    expect(updatedData).toEqual(
      expect.arrayContaining([
        { id: 1, col1: 1, col2: 1 },
        { id: 2, col1: 2, col2: 2 },
        { id: 3, col1: 3, col2: 3 },
      ]),
    )
  })

  it('updates json array and object successfully', async () => {
    await db.execute(`INSERT INTO ${surrogateJsonTableName} (id) values (1), (2), (3)`)

    await drizzleFullBulkUpdate(db, surrogateJsonTable, [
      { where: { id: 1 }, data: { json_data: [{ some: 'val' }] } },
      { where: { id: 2 }, data: { json_data: [{ some: 'val2' }] } },
      { where: { id: 3 }, data: { json_data: { some: 'val' } } },
    ])

    const updatedData = await db.execute(`SELECT * FROM ${surrogateJsonTableName}`)

    expect(updatedData).toEqual(
      expect.arrayContaining([
        { id: 1, json_data: [{ some: 'val' }] },
        { id: 2, json_data: [{ some: 'val2' }] },
        { id: 3, json_data: { some: 'val' } },
      ]),
    )
  })

  it('handles enum columns correctly', async () => {
    await db.execute(
      `INSERT INTO ${standardEnumTableName} (id, status) VALUES (1, 'active'), (2, 'active')`,
    )

    await drizzleFullBulkUpdate(db, standardEnumTable, [
      { where: { id: 1 }, data: { status: 'inactive' } },
      { where: { id: 2 }, data: { status: 'inactive' } },
    ])

    const updatedData = await db.execute(`SELECT * FROM ${standardEnumTableName}`)

    expect(updatedData).toEqual(
      expect.arrayContaining([
        { id: 1, status: 'inactive' },
        { id: 2, status: 'inactive' },
      ]),
    )
  })

  it('handles object enum columns correctly', async () => {
    await db.execute(
      `INSERT INTO ${objectEnumTableName} (id, status) VALUES (1, 'active'), (2, 'active')`,
    )

    await drizzleFullBulkUpdate(db, objectEnumTable, [
      { where: { id: 1 }, data: { status: ObjectStatusEnum.INACTIVE } },
      { where: { id: 2 }, data: { status: ObjectStatusEnum.INACTIVE } },
    ])

    const updatedData = await db.execute(`SELECT * FROM ${objectEnumTableName}`)

    expect(updatedData).toEqual(
      expect.arrayContaining([
        { id: 1, status: 'inactive' },
        { id: 2, status: 'inactive' },
      ]),
    )
  })

  it('handles object enum in where condition correctly', async () => {
    await db.execute(
      `INSERT INTO ${objectEnumTableName} (id, status) VALUES (1, 'active'), (2, 'inactive')`,
    )

    await drizzleFullBulkUpdate(db, objectEnumTable, [
      { where: { status: ObjectStatusEnum.ACTIVE }, data: { id: 10 } },
    ])

    const updatedData = await db.execute(`SELECT * FROM ${objectEnumTableName}`)

    expect(updatedData).toEqual(
      expect.arrayContaining([
        { id: 10, status: 'active' },
        { id: 2, status: 'inactive' },
      ]),
    )
  })

  it('handles Date values in timestamp columns correctly', async () => {
    await db.execute(`INSERT INTO ${timestampTableName} (id) values (1), (2)`)

    const ts1 = new Date('2026-01-15T10:30:00.000Z')
    const ts2 = new Date('2026-02-20T08:00:00.000Z')

    await drizzleFullBulkUpdate(db, timestampTable, [
      { where: { id: 1 }, data: { updated_at: ts1 } },
      { where: { id: 2 }, data: { updated_at: ts2 } },
    ])

    const updatedData = (await db.execute(
      `SELECT id, updated_at FROM ${timestampTableName} ORDER BY id`,
    )) as unknown as { id: number; updated_at: string | Date }[]

    expect(
      updatedData.map((r) => ({ id: r.id, updated_at: new Date(r.updated_at).toISOString() })),
    ).toEqual([
      { id: 1, updated_at: ts1.toISOString() },
      { id: 2, updated_at: ts2.toISOString() },
    ])
  })

  describe('generated statement', () => {
    // Only rendered, never created in the database.
    const mixedTable = pgTable('test_mixed', {
      id: smallint(),
      status: standardStatusEnum(),
      flag: boolean(),
      big: bigint({ mode: 'bigint' }),
      updated_at: timestamp({ withTimezone: true }),
      col1: smallint(),
    })

    it('emits a where column with the same value on every entry as a constant predicate', async () => {
      const { capturingDb, captured } = createCapturingDb()

      await drizzleFullBulkUpdate(capturingDb, compositeTable, [
        { where: { id1: 7, id2: 1 }, data: { col1: 11 } },
        { where: { id1: 7, id2: 2 }, data: { col1: 21 } },
      ])

      expect(captured.text).toBe(
        'UPDATE "public"."test_composite" AS tbl SET "col1" = updates."col1"::smallint ' +
          'FROM ( VALUES ($1::smallint,$2::smallint), ($3::smallint,$4::smallint) ) AS updates("id2", "col1") ' +
          'WHERE tbl."id1" = $5::smallint AND tbl."id2" = updates."id2"::smallint',
      )
      expect(captured.params).toEqual([1, 11, 2, 21, 7])
    })

    it('keeps the where columns in VALUES when their values differ', async () => {
      const { capturingDb, captured } = createCapturingDb()

      await drizzleFullBulkUpdate(capturingDb, compositeTable, [
        { where: { id1: 1, id2: 1 }, data: { col1: 11 } },
        { where: { id1: 2, id2: 2 }, data: { col1: 21 } },
      ])

      expect(captured.text).toContain('AS updates("id1", "id2", "col1")')
      expect(captured.text).toContain(
        'WHERE tbl."id1" = updates."id1"::smallint AND tbl."id2" = updates."id2"::smallint',
      )
    })

    it('emits every where column as a constant when several entries share every where value', async () => {
      const { capturingDb, captured } = createCapturingDb()

      await drizzleFullBulkUpdate(capturingDb, compositeTable, [
        { where: { id1: 7, id2: 3 }, data: { col1: 11 } },
        { where: { id1: 7, id2: 3 }, data: { col1: 21 } },
      ])

      expect(captured.text).toContain('AS updates("col1")')
      expect(captured.text).toContain('WHERE tbl."id1" = $3::smallint AND tbl."id2" = $4::smallint')
      expect(captured.params).toEqual([11, 21, 7, 3])
    })

    it('emits every where column as a constant for a single entry', async () => {
      const { capturingDb, captured } = createCapturingDb()

      await drizzleFullBulkUpdate(capturingDb, compositeTable, [
        { where: { id1: 7, id2: 3 }, data: { col1: 11 } },
      ])

      expect(captured.text).toBe(
        'UPDATE "public"."test_composite" AS tbl SET "col1" = updates."col1"::smallint ' +
          'FROM ( VALUES ($1::smallint) ) AS updates("col1") ' +
          'WHERE tbl."id1" = $2::smallint AND tbl."id2" = $3::smallint',
      )
      expect(captured.params).toEqual([11, 7, 3])
    })

    it('treats uniform strings, booleans and bigints as constants', async () => {
      const { capturingDb, captured } = createCapturingDb()

      await drizzleFullBulkUpdate(capturingDb, mixedTable, [
        { where: { id: 1, status: 'active', flag: true, big: 10n }, data: { col1: 11 } },
        { where: { id: 2, status: 'active', flag: true, big: 10n }, data: { col1: 21 } },
      ])

      expect(captured.text).toContain('AS updates("id", "col1")')
      expect(captured.text).toContain(
        `tbl."status" = $5::"${enumSchema}".${standardStatusEnumName}`,
      )
      expect(captured.params).toEqual([1, 11, 2, 21, 'active', true, 10n])
    })

    it.each([
      ['null', null],
      ['a Date', new Date('2026-01-01T00:00:00Z')],
    ])('keeps a where column in VALUES when the shared value is %s', async (_, value) => {
      const { capturingDb, captured } = createCapturingDb()

      await drizzleFullBulkUpdate(capturingDb, mixedTable, [
        { where: { id: 1, updated_at: value }, data: { col1: 11 } },
        { where: { id: 2, updated_at: value }, data: { col1: 21 } },
      ])

      expect(captured.text).toContain('AS updates("id", "updated_at", "col1")')
    })
  })

  it('scopes the update by a where column shared by every entry', async () => {
    await db.execute(
      `INSERT INTO ${compositeTableName} (id1, id2, col1, col2) values (1, 1, 1, 1), (1, 2, 2, 2), (2, 3, 3, 3)`,
    )

    // The last row's id2 is listed under the wrong id1, so the shared id1
    // predicate must keep it from being updated.
    await drizzleFullBulkUpdate(db, compositeTable, [
      { where: { id1: 1, id2: 1 }, data: { col1: 5 } },
      { where: { id1: 1, id2: 2 }, data: { col1: 6 } },
      { where: { id1: 1, id2: 3 }, data: { col1: 7 } },
    ])

    const updatedData = await db.execute(`SELECT * FROM ${compositeTableName}`)

    expect(updatedData).toEqual(
      expect.arrayContaining([
        { id1: 1, id2: 1, col1: 5, col2: 1 },
        { id1: 1, id2: 2, col1: 6, col2: 2 },
        { id1: 2, id2: 3, col1: 3, col2: 3 },
      ]),
    )
  })

  it('updates a single entry matched only by constant predicates', async () => {
    await db.execute(
      `INSERT INTO ${compositeTableName} (id1, id2, col1, col2) values (1, 1, 1, 1), (1, 2, 2, 2)`,
    )

    await drizzleFullBulkUpdate(db, compositeTable, [
      { where: { id1: 1, id2: 2 }, data: { col1: 9 } },
    ])

    const updatedData = await db.execute(`SELECT * FROM ${compositeTableName}`)

    expect(updatedData).toEqual(
      expect.arrayContaining([
        { id1: 1, id2: 1, col1: 1, col2: 1 },
        { id1: 1, id2: 2, col1: 9, col2: 2 },
      ]),
    )
  })

  it('updates a row once when several entries share every where value', async () => {
    await db.execute(
      `INSERT INTO ${compositeTableName} (id1, id2, col1, col2) values (1, 1, 1, 1), (1, 2, 2, 2)`,
    )

    await drizzleFullBulkUpdate(db, compositeTable, [
      { where: { id1: 1, id2: 1 }, data: { col1: 5 } },
      { where: { id1: 1, id2: 1 }, data: { col1: 6 } },
    ])

    const updatedData = (await db.execute(
      `SELECT * FROM ${compositeTableName} ORDER BY id2`,
    )) as unknown as { col1: number }[]

    expect(updatedData).toHaveLength(2)
    expect([5, 6]).toContain(updatedData[0]?.col1)
    expect(updatedData[1]).toEqual({ id1: 1, id2: 2, col1: 2, col2: 2 })
  })
})
