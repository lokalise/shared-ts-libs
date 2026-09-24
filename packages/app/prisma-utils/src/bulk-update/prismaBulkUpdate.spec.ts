import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import type { Sql } from '@prisma/client/runtime/client'
import { PrismaClient } from 'db-client/client.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanTables, DB_MODEL } from '../../test/DbCleaner.ts'
import { getDatasourceUrl } from '../../test/getDatasourceUrl.ts'
import { DbDriverEnum } from '../types.ts'
import { prismaBulkUpdate } from './prismaBulkUpdate.ts'
import type { PrismaBulkUpdateOptions } from './types.ts'

const TABLE = 'bulk_update_item'

// SQL types of the bulk_update_item columns exercised by these tests.
const typeByColumn = {
  id: 'uuid',
  group_id: 'uuid',
  number: 'int4',
  value: 'text',
  count: 'int4',
  metadata: 'jsonb',
} as const

const cockroachOptions = (returning?: Record<string, string>): PrismaBulkUpdateOptions => ({
  dbDriver: DbDriverEnum.COCKROACH_DB,
  typeByColumn,
  returning,
})

/**
 * A client that records the statement instead of running it, so a test can
 * assert the generated SQL. Whitespace is collapsed to keep expectations readable.
 */
const createCapturingClient = () => {
  const captured: { text?: string; values?: unknown[] } = {}
  const capture = (query: Sql) => {
    captured.text = query.text.replace(/\s+/g, ' ').trim()
    captured.values = query.values
    return Promise.resolve([])
  }
  const client = { $executeRaw: capture, $queryRaw: capture } as unknown as PrismaClient
  return { client, captured }
}

describe('prismaBulkUpdate', () => {
  let prisma: PrismaClient

  beforeAll(() => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: getDatasourceUrl() }),
    })
  })

  beforeEach(async () => {
    await cleanTables(prisma, [DB_MODEL.bulkUpdateItem])
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  const createItem = (overrides?: {
    id?: string
    groupId?: string
    number?: number
    value?: string
    count?: number | null
    metadata?: unknown
  }) =>
    prisma.bulkUpdateItem.create({
      data: {
        id: overrides?.id ?? randomUUID(),
        groupId: overrides?.groupId ?? randomUUID(),
        number: overrides?.number ?? 0,
        value: overrides?.value ?? 'init',
        count: overrides?.count ?? null,
        ...(overrides?.metadata === undefined ? {} : { metadata: overrides.metadata as never }),
      },
    })

  describe('input validation', () => {
    it('throws an error if entries array is empty', () => {
      expect(() => prismaBulkUpdate(prisma, TABLE, cockroachOptions(), [])).toThrow(
        'Entries array must not be empty',
      )
    })

    it('throws an error if entries array exceeds 1000 entries', () => {
      expect(() =>
        prismaBulkUpdate(
          prisma,
          TABLE,
          cockroachOptions(),
          Array.from({ length: 1001 }, () => ({
            where: { id: randomUUID() },
            data: { value: 'x' },
          })),
        ),
      ).toThrow('Entries array length must not exceed 1000')
    })

    it('throws an error if the total bind parameters exceed the limit', () => {
      // 700 entries × (1 where + 100 data) columns = 70700 placeholders, above the
      // 65535 limit. The columns need not exist on the table: the guard throws
      // before any SQL is built or sent to the driver.
      const dataColumnNames = Array.from({ length: 100 }, (_, index) => `c${index}`)
      const wideTypeByColumn = Object.fromEntries(dataColumnNames.map((name) => [name, 'int4']))
      const data = Object.fromEntries(dataColumnNames.map((name, index) => [name, index]))
      const entries = Array.from({ length: 700 }, () => ({ where: { id: randomUUID() }, data }))

      expect(() =>
        prismaBulkUpdate(
          prisma,
          TABLE,
          {
            dbDriver: DbDriverEnum.COCKROACH_DB,
            typeByColumn: { id: 'uuid', ...wideTypeByColumn },
          },
          entries,
        ),
      ).toThrow('Bulk update would use 70700 bind parameters')
    })

    it('counts a uniform where column as a single bind parameter', () => {
      // 700 entries × (1 varying where + 100 data) + 1 constant group_id = 70701.
      const dataColumnNames = Array.from({ length: 100 }, (_, index) => `c${index}`)
      const wideTypeByColumn = Object.fromEntries(dataColumnNames.map((name) => [name, 'int4']))
      const data = Object.fromEntries(dataColumnNames.map((name, index) => [name, index]))
      const groupId = randomUUID()
      const entries = Array.from({ length: 700 }, () => ({
        where: { group_id: groupId, id: randomUUID() },
        data,
      }))

      expect(() =>
        prismaBulkUpdate(
          prisma,
          TABLE,
          {
            dbDriver: DbDriverEnum.COCKROACH_DB,
            typeByColumn: { id: 'uuid', group_id: 'uuid', ...wideTypeByColumn },
          },
          entries,
        ),
      ).toThrow(
        'Bulk update would use 70701 bind parameters (700 entries × 101 columns + 1 constant "where" values)',
      )
    })

    it('throws an error if where is empty', () => {
      expect(() =>
        prismaBulkUpdate(prisma, TABLE, cockroachOptions(), [{ where: {}, data: { value: 'x' } }]),
      ).toThrow('Entry "where" object must not be empty')
    })

    it('throws an error if data is empty', () => {
      expect(() =>
        prismaBulkUpdate(prisma, TABLE, cockroachOptions(), [
          { where: { id: randomUUID() }, data: {} },
        ]),
      ).toThrow('Entry "data" object must not be empty')
    })

    it('throws an error if a column type mapping is missing', () => {
      expect(() =>
        prismaBulkUpdate(
          prisma,
          TABLE,
          { dbDriver: DbDriverEnum.COCKROACH_DB, typeByColumn: { id: 'uuid' } },
          [{ where: { id: randomUUID() }, data: { value: 'x' } }],
        ),
      ).toThrow('Column type mapping is missing for "value"')
    })

    it('throws an error if amount of where columns differs between entries', () => {
      expect(() =>
        prismaBulkUpdate(prisma, TABLE, cockroachOptions(), [
          { where: { id: randomUUID() }, data: { value: 'x' } },
          { where: { id: randomUUID(), number: 1 }, data: { value: 'y' } },
        ]),
      ).toThrow('Entry "where" columns are not the same')
    })

    it('throws an error if amount of data columns differs between entries', () => {
      expect(() =>
        prismaBulkUpdate(prisma, TABLE, cockroachOptions(), [
          { where: { id: randomUUID() }, data: { value: 'x' } },
          { where: { id: randomUUID() }, data: { value: 'y', count: 1 } },
        ]),
      ).toThrow('Entry "data" columns are not the same')
    })

    it('throws an error if data column names differ between entries', () => {
      expect(() =>
        prismaBulkUpdate(prisma, TABLE, cockroachOptions(), [
          { where: { id: randomUUID() }, data: { value: 'x' } },
          { where: { id: randomUUID() }, data: { count: 1 } },
        ]),
      ).toThrow('Entry "data" column "value" was not found')
    })

    it('throws an error if where column names differ between entries', () => {
      expect(() =>
        prismaBulkUpdate(prisma, TABLE, cockroachOptions(), [
          { where: { id: randomUUID() }, data: { value: 'x' } },
          { where: { number: 1 }, data: { value: 'y' } },
        ]),
      ).toThrow('Entry "where" column "id" was not found')
    })

    it('reports the entry index of a mismatched entry', () => {
      expect(() =>
        prismaBulkUpdate(prisma, TABLE, cockroachOptions(), [
          { where: { id: randomUUID() }, data: { value: 'x' } },
          { where: { id: randomUUID() }, data: { value: 'y' } },
          { where: { id: randomUUID() }, data: { count: 1 } },
        ]),
      ).toThrow('Entry "data" column "value" was not found (at index 2)')
    })

    it('throws an error if a where value is undefined', () => {
      expect(() =>
        prismaBulkUpdate(prisma, TABLE, cockroachOptions(), [
          { where: { id: undefined }, data: { value: 'x' } },
        ]),
      ).toThrow('Entry "where" column "id" must not be undefined')
    })

    it('throws an error if a column appears in both where and data', () => {
      expect(() =>
        prismaBulkUpdate(prisma, TABLE, cockroachOptions(), [
          { where: { id: randomUUID() }, data: { id: randomUUID(), value: 'x' } },
        ]),
      ).toThrow('Column "id" must not appear in both "where" and "data"')
    })
  })

  describe('generated statement', () => {
    const groupId = '00000000-0000-0000-0000-00000000000a'
    const id1 = '00000000-0000-0000-0000-000000000001'
    const id2 = '00000000-0000-0000-0000-000000000002'

    it('emits a where column with the same value on every entry as a constant predicate', async () => {
      const { client, captured } = createCapturingClient()

      await prismaBulkUpdate(client, TABLE, cockroachOptions(), [
        { where: { group_id: groupId, id: id1 }, data: { value: 'a' } },
        { where: { group_id: groupId, id: id2 }, data: { value: 'b' } },
      ])

      expect(captured.text).toBe(
        'UPDATE "bulk_update_item" SET "value" = updates."value"::text ' +
          'FROM ( VALUES ($1::uuid,$2::text), ($3::uuid,$4::text) ) AS updates("id", "value") ' +
          'WHERE "bulk_update_item"."group_id" = $5::uuid AND "bulk_update_item"."id" = updates."id"::uuid',
      )
      expect(captured.values).toEqual([id1, 'a', id2, 'b', groupId])
    })

    it('keeps the where columns in VALUES when their values differ', async () => {
      const { client, captured } = createCapturingClient()

      await prismaBulkUpdate(client, TABLE, cockroachOptions(), [
        { where: { group_id: randomUUID(), number: 0 }, data: { value: 'a' } },
        { where: { group_id: randomUUID(), number: 1 }, data: { value: 'b' } },
      ])

      expect(captured.text).toContain('AS updates("group_id", "number", "value")')
      expect(captured.text).toContain(
        'WHERE "bulk_update_item"."group_id" = updates."group_id"::uuid ' +
          'AND "bulk_update_item"."number" = updates."number"::int4',
      )
    })

    it('keeps the first where column in VALUES when several entries share every where value', async () => {
      const { client, captured } = createCapturingClient()

      await prismaBulkUpdate(client, TABLE, cockroachOptions(), [
        { where: { group_id: groupId, number: 3 }, data: { value: 'a' } },
        { where: { group_id: groupId, number: 3 }, data: { value: 'b' } },
      ])

      expect(captured.text).toContain('AS updates("group_id", "value")')
      expect(captured.text).toContain(
        'WHERE "bulk_update_item"."group_id" = updates."group_id"::uuid ' +
          'AND "bulk_update_item"."number" = $5::int4',
      )
      expect(captured.values).toEqual([groupId, 'a', groupId, 'b', 3])
    })

    it('emits every where column as a constant for a single entry', async () => {
      const { client, captured } = createCapturingClient()

      await prismaBulkUpdate(client, TABLE, cockroachOptions(), [
        { where: { group_id: groupId, number: 3 }, data: { value: 'a' } },
      ])

      expect(captured.text).toBe(
        'UPDATE "bulk_update_item" SET "value" = updates."value"::text ' +
          'FROM ( VALUES ($1::text) ) AS updates("value") ' +
          'WHERE "bulk_update_item"."group_id" = $2::uuid AND "bulk_update_item"."number" = $3::int4',
      )
      expect(captured.values).toEqual(['a', groupId, 3])
    })

    it('treats uniform numbers, booleans and bigints as constants', async () => {
      const { client, captured } = createCapturingClient()

      await prismaBulkUpdate(
        client,
        TABLE,
        {
          dbDriver: DbDriverEnum.POSTGRES,
          typeByColumn: { id: 'uuid', n: 'int4', flag: 'bool', big: 'int8', value: 'text' },
        },
        [
          { where: { id: id1, n: 1, flag: true, big: 10n }, data: { value: 'a' } },
          { where: { id: id2, n: 1, flag: true, big: 10n }, data: { value: 'b' } },
        ],
      )

      expect(captured.text).toContain('AS updates("id", "value")')
      expect(captured.values).toEqual([id1, 'a', id2, 'b', 1, true, 10n])
    })

    it.each([
      ['null', 'int4', null],
      ['a Date', 'timestamptz', new Date('2026-01-01T00:00:00Z')],
      ['a Buffer', 'bytea', Buffer.from('ab')],
    ])('keeps a where column in VALUES when the shared value is %s', async (_, type, value) => {
      const { client, captured } = createCapturingClient()

      await prismaBulkUpdate(
        client,
        TABLE,
        { dbDriver: DbDriverEnum.POSTGRES, typeByColumn: { id: 'uuid', col: type, value: 'text' } },
        [
          { where: { id: id1, col: value }, data: { value: 'a' } },
          { where: { id: id2, col: value }, data: { value: 'b' } },
        ],
      )

      expect(captured.text).toContain('AS updates("id", "col", "value")')
    })

    it('keeps a json where column in VALUES even when its value is a shared string', async () => {
      const { client, captured } = createCapturingClient()

      await prismaBulkUpdate(
        client,
        TABLE,
        {
          dbDriver: DbDriverEnum.POSTGRES,
          typeByColumn: { id: 'uuid', doc: 'jsonb', value: 'text' },
        },
        [
          { where: { id: id1, doc: 'same' }, data: { value: 'a' } },
          { where: { id: id2, doc: 'same' }, data: { value: 'b' } },
        ],
      )

      expect(captured.text).toContain('AS updates("id", "doc", "value")')
    })
  })

  describe('bulk update against bulk_update_item', () => {
    it('partially updates rows matched by their surrogate id, leaving others untouched', async () => {
      const i1 = await createItem({ value: 'before-1', count: 1 })
      const i2 = await createItem({ value: 'before-2', count: 2 })
      const i3 = await createItem({ value: 'before-3', count: 3 })

      await prismaBulkUpdate(prisma, TABLE, cockroachOptions(), [
        { where: { id: i1.id }, data: { value: 'after-1', count: 11 } },
        { where: { id: i2.id }, data: { value: 'after-2', count: 22 } },
      ])

      const items = await prisma.bulkUpdateItem.findMany({
        where: { id: { in: [i1.id, i2.id, i3.id] } },
        select: { id: true, value: true, count: true },
      })

      expect(items).toEqual(
        expect.arrayContaining([
          { id: i1.id, value: 'after-1', count: 11 },
          { id: i2.id, value: 'after-2', count: 22 },
          { id: i3.id, value: 'before-3', count: 3 },
        ]),
      )
    })

    it('updates rows matched by a composite key', async () => {
      const groupId = randomUUID()
      await createItem({ groupId, number: 0, value: 'before-0' })
      await createItem({ groupId, number: 1, value: 'before-1' })
      await createItem({ groupId, number: 2, value: 'before-2' })

      await prismaBulkUpdate(prisma, TABLE, cockroachOptions(), [
        { where: { group_id: groupId, number: 0 }, data: { value: 'after-0' } },
        { where: { group_id: groupId, number: 1 }, data: { value: 'after-1' } },
      ])

      const items = await prisma.bulkUpdateItem.findMany({
        where: { groupId },
        select: { number: true, value: true },
        orderBy: { number: 'asc' },
      })

      expect(items).toEqual([
        { number: 0, value: 'after-0' },
        { number: 1, value: 'after-1' },
        { number: 2, value: 'before-2' },
      ])
    })

    it('scopes the update by a where column shared by every entry', async () => {
      const groupId = randomUUID()
      const i0 = await createItem({ groupId, number: 0, value: 'before-0' })
      const i1 = await createItem({ groupId, number: 1, value: 'before-1' })
      const foreign = await createItem({ groupId: randomUUID(), value: 'before-foreign' })

      // The foreign row's id is listed under the wrong group, so the shared
      // group_id predicate must keep it from being updated.
      await prismaBulkUpdate(prisma, TABLE, cockroachOptions(), [
        { where: { group_id: groupId, id: i0.id }, data: { value: 'after-0' } },
        { where: { group_id: groupId, id: i1.id }, data: { value: 'after-1' } },
        { where: { group_id: groupId, id: foreign.id }, data: { value: 'after-foreign' } },
      ])

      const items = await prisma.bulkUpdateItem.findMany({
        where: { id: { in: [i0.id, i1.id, foreign.id] } },
        select: { id: true, value: true },
      })

      expect(items).toEqual(
        expect.arrayContaining([
          { id: i0.id, value: 'after-0' },
          { id: i1.id, value: 'after-1' },
          { id: foreign.id, value: 'before-foreign' },
        ]),
      )
    })

    it('updates a single entry matched only by constant predicates', async () => {
      const groupId = randomUUID()
      await createItem({ groupId, number: 0, value: 'before-0' })
      await createItem({ groupId, number: 1, value: 'before-1' })

      const result = await prismaBulkUpdate<{ number: number; value: string }>(
        prisma,
        TABLE,
        cockroachOptions({ number: 'number', value: 'value' }),
        [{ where: { group_id: groupId, number: 1 }, data: { value: 'after-1' } }],
      )

      expect(result).toEqual([{ number: 1, value: 'after-1' }])

      const items = await prisma.bulkUpdateItem.findMany({
        where: { groupId },
        select: { number: true, value: true },
        orderBy: { number: 'asc' },
      })
      expect(items).toEqual([
        { number: 0, value: 'before-0' },
        { number: 1, value: 'after-1' },
      ])
    })

    it('updates a row once when several entries share every where value', async () => {
      const groupId = randomUUID()
      const target = await createItem({ groupId, number: 0, value: 'before' })
      const other = await createItem({ groupId, number: 1, value: 'before-other' })

      const result = await prismaBulkUpdate<{ id: string; value: string }>(
        prisma,
        TABLE,
        cockroachOptions({ id: 'id', value: 'value' }),
        [
          { where: { group_id: groupId, number: 0 }, data: { value: 'first' } },
          { where: { group_id: groupId, number: 0 }, data: { value: 'second' } },
        ],
      )

      expect(result).toHaveLength(1)
      expect(result[0]?.id).toBe(target.id)
      expect(['first', 'second']).toContain(result[0]?.value)

      const [untouched] = await prisma.bulkUpdateItem.findMany({
        where: { id: other.id },
        select: { value: true },
      })
      expect(untouched).toEqual({ value: 'before-other' })
    })

    it('rolls back the whole bulk update if any row violates a constraint', async () => {
      const groupId = randomUUID()
      const c0 = await createItem({ groupId, number: 0 })
      await createItem({ groupId, number: 1 })
      const c2 = await createItem({ groupId, number: 2 })

      // c0.number -> 1 collides with the existing row at number 1 (same unique
      // (group_id, number)), while c2.number -> 9 would be valid on its own. The
      // constraint violation surfaces while executing the statement, so it rejects.
      await expect(
        prismaBulkUpdate(
          prisma,
          TABLE,
          { dbDriver: DbDriverEnum.COCKROACH_DB, typeByColumn: { id: 'uuid', number: 'int4' } },
          [
            { where: { id: c2.id }, data: { number: 9 } },
            { where: { id: c0.id }, data: { number: 1 } },
          ],
        ),
      ).rejects.toThrow()

      const items = await prisma.bulkUpdateItem.findMany({
        where: { groupId },
        select: { number: true },
        orderBy: { number: 'asc' },
      })

      expect(items).toEqual([{ number: 0 }, { number: 1 }, { number: 2 }])
    })

    it('updates jsonb columns with both object and array values', async () => {
      const j1 = await createItem()
      const j2 = await createItem()

      await prismaBulkUpdate(
        prisma,
        TABLE,
        { dbDriver: DbDriverEnum.COCKROACH_DB, typeByColumn: { id: 'uuid', metadata: 'jsonb' } },
        [
          { where: { id: j1.id }, data: { metadata: { origin: 'object' } } },
          { where: { id: j2.id }, data: { metadata: [{ origin: 'array' }] } },
        ],
      )

      const items = await prisma.bulkUpdateItem.findMany({
        where: { id: { in: [j1.id, j2.id] } },
        select: { id: true, metadata: true },
      })

      expect(items).toEqual(
        expect.arrayContaining([
          { id: j1.id, metadata: { origin: 'object' } },
          { id: j2.id, metadata: [{ origin: 'array' }] },
        ]),
      )
    })

    it('leaves columns with an undefined value untouched', async () => {
      const i1 = await createItem({ value: 'before', count: 5 })

      await prismaBulkUpdate(prisma, TABLE, cockroachOptions(), [
        { where: { id: i1.id }, data: { value: 'after', count: undefined } },
      ])

      const [item] = await prisma.bulkUpdateItem.findMany({
        where: { id: i1.id },
        select: { value: true, count: true },
      })

      expect(item).toEqual({ value: 'after', count: 5 })
    })

    it('sets a column to SQL NULL when the value is null', async () => {
      const i1 = await createItem({ metadata: { keep: 'me' } })

      await prismaBulkUpdate(
        prisma,
        TABLE,
        { dbDriver: DbDriverEnum.COCKROACH_DB, typeByColumn: { id: 'uuid', metadata: 'jsonb' } },
        [{ where: { id: i1.id }, data: { metadata: null } }],
      )

      const [item] = await prisma.bulkUpdateItem.findMany({
        where: { id: i1.id },
        select: { metadata: true },
      })

      expect(item).toEqual({ metadata: null })
    })

    describe('returning', () => {
      it('returns the updated rows aliased per the returning map', async () => {
        const i1 = await createItem({ value: 'before-1', count: 1 })
        const i2 = await createItem({ value: 'before-2', count: 2 })

        const result = await prismaBulkUpdate<{ id: string; value: string; itemCount: number }>(
          prisma,
          TABLE,
          cockroachOptions({ id: 'id', value: 'value', count: 'itemCount' }),
          [
            { where: { id: i1.id }, data: { value: 'after-1', count: 11 } },
            { where: { id: i2.id }, data: { value: 'after-2', count: 22 } },
          ],
        )

        expect(result).toEqual(
          expect.arrayContaining([
            { id: i1.id, value: 'after-1', itemCount: 11 },
            { id: i2.id, value: 'after-2', itemCount: 22 },
          ]),
        )
      })

      it('returns an empty array when no returning map is provided', async () => {
        const i1 = await createItem({ value: 'before' })

        const result = await prismaBulkUpdate(prisma, TABLE, cockroachOptions(), [
          { where: { id: i1.id }, data: { value: 'after' } },
        ])

        expect(result).toEqual([])
      })

      it('applies the update and returns an empty array when returning map is empty', async () => {
        const i1 = await createItem({ value: 'before' })

        const result = await prismaBulkUpdate(prisma, TABLE, cockroachOptions({}), [
          { where: { id: i1.id }, data: { value: 'after' } },
        ])

        expect(result).toEqual([])

        const [item] = await prisma.bulkUpdateItem.findMany({
          where: { id: i1.id },
          select: { value: true },
        })
        expect(item).toEqual({ value: 'after' })
      })
    })
  })
})
