import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
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
