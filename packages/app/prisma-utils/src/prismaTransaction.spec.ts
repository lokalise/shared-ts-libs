import type { Either } from '@lokalise/node-core'
import { PrismaClient } from '@prisma/client'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vitest } from 'vitest'

import { DB_MODEL, cleanTables } from '../test/DbCleaner'

import {
  PRISMA_NOT_FOUND_ERROR,
  PRISMA_SERIALIZATION_ERROR,
  PRISMA_TRANSACTION_ERROR,
} from './errors/prismaError'
import { prismaTransaction } from './prismaTransaction'

const EnvDatabaseUrlKey = 'DATABASE_URL'

type Item1 = {
  value: string
}

type Item2 = {
  value: string
}

const TEST_ITEM_1: Item1 = {
  value: 'one',
}
const TEST_ITEM_2: Item2 = {
  value: 'two',
}

describe('prismaTransaction', () => {
  let prisma: PrismaClient

  beforeAll(() => {
    prisma = new PrismaClient({
      datasourceUrl: process.env[EnvDatabaseUrlKey],
    })
  })

  beforeEach(async () => {
    await cleanTables(prisma, [DB_MODEL.item1, DB_MODEL.item2])
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  describe('with function callback', () => {
    it('first try works', async () => {
      // When
      const result: Either<unknown, Item1> = await prismaTransaction(prisma, (client) =>
        client.item1.create({ data: TEST_ITEM_1 }),
      )

      // Then
      expect(result.result).toMatchObject(TEST_ITEM_1)
    })

    it('interactive transaction returns correct types', async () => {
      // When
      const result = await prismaTransaction(prisma, async (client) => {
        return await client.item1.create({ data: TEST_ITEM_1 })
      })

      // Then
      expect(result.result?.value).toMatchObject(TEST_ITEM_1.value)
      expect(result.result?.id).toBeDefined()
    })

    it('default reties (3) and delay (100)', async () => {
      // Given
      const callsTimestamps: number[] = []
      const retrySpy = vitest.spyOn(prisma, '$transaction').mockImplementation(() => {
        callsTimestamps.push(Date.now())
        throw new PrismaClientKnownRequestError('test', {
          code: PRISMA_SERIALIZATION_ERROR,
          clientVersion: '1',
        })
      })

      // When
      const result = await prismaTransaction(prisma, (client) =>
        client.item1.create({ data: TEST_ITEM_1 }),
      )

      // Then
      expect(result.error).toBeInstanceOf(PrismaClientKnownRequestError)
      expect((result.error as PrismaClientKnownRequestError).code).toBe(PRISMA_SERIALIZATION_ERROR)
      expect(retrySpy).toHaveBeenCalledTimes(3)

      const diffs: number[] = []
      callsTimestamps.forEach((t, i) => {
        if (i > 0) diffs.push(Math.round((t - callsTimestamps[i - 1]) / 100) * 100)
      })
      expect(diffs).toHaveLength(2)
      expect(diffs[0]).toBe(100)
      expect(diffs[1]).toBe(200)
    })

    it('modifying max number of retries and base delay', async () => {
      // Given
      const retriesAllowed = 5
      const baseRetryDelayMs = 50

      const callsTimestamps: number[] = []
      const retrySpy = vitest.spyOn(prisma, '$transaction').mockImplementation(() => {
        callsTimestamps.push(Date.now())
        throw new PrismaClientKnownRequestError('test', {
          code: PRISMA_SERIALIZATION_ERROR,
          clientVersion: '1',
        })
      })

      // When
      const result = await prismaTransaction(
        prisma,
        (client) => client.item1.create({ data: TEST_ITEM_1 }),
        { retriesAllowed, baseRetryDelayMs },
      )

      // Then
      expect(result.error).toBeInstanceOf(PrismaClientKnownRequestError)
      expect((result.error as PrismaClientKnownRequestError).code).toBe(PRISMA_SERIALIZATION_ERROR)
      expect(retrySpy).toHaveBeenCalledTimes(5)

      const diffs: number[] = []
      callsTimestamps.forEach((t, i) => {
        if (i > 0) diffs.push(Math.round((t - callsTimestamps[i - 1]) / 10) * 10)
      })
      expect(diffs).toHaveLength(4)

      expect(diffs[0]).toBe(50)
      expect(diffs[1]).toBe(100)
      expect(diffs[2]).toBe(200)
      expect(diffs[3]).toBe(400)
    })

    it('max delay is respected', async () => {
      // Given
      const baseRetryDelayMs = 1000
      const maxRetryDelayMs = 10

      const callsTimestamps: number[] = []
      const retrySpy = vitest.spyOn(prisma, '$transaction').mockImplementation(() => {
        callsTimestamps.push(Date.now())
        throw new PrismaClientKnownRequestError('test', {
          code: PRISMA_SERIALIZATION_ERROR,
          clientVersion: '1',
        })
      })

      // When
      const result = await prismaTransaction(
        prisma,
        (client) => client.item1.create({ data: TEST_ITEM_1 }),
        { maxRetryDelayMs, baseRetryDelayMs },
      )

      // Then
      expect(result.error).toBeInstanceOf(PrismaClientKnownRequestError)
      expect((result.error as PrismaClientKnownRequestError).code).toBe(PRISMA_SERIALIZATION_ERROR)
      expect(retrySpy).toHaveBeenCalledTimes(3)

      const diffs: number[] = []
      callsTimestamps.forEach((t, i) => {
        if (i > 0) diffs.push(Math.round((t - callsTimestamps[i - 1]) / 10) * 10)
      })
      expect(diffs).toHaveLength(2)

      expect(diffs[0]).toBe(10)
      expect(diffs[1]).toBe(10)
    })

    it('not all prisma code are retried', async () => {
      // Given
      const retrySpy = vitest.spyOn(prisma, '$transaction').mockRejectedValue(
        new PrismaClientKnownRequestError('test', {
          code: PRISMA_NOT_FOUND_ERROR,
          clientVersion: '1',
        }),
      )

      // When
      const result = await prismaTransaction(prisma, (client) =>
        client.item1.create({ data: TEST_ITEM_1 }),
      )

      // Then
      expect(result.error).toBeInstanceOf(PrismaClientKnownRequestError)
      expect((result.error as PrismaClientKnownRequestError).code).toBe(PRISMA_NOT_FOUND_ERROR)
      expect(retrySpy).toHaveBeenCalledTimes(1)
    })

    it('timeout auto increase', async () => {
      // Given
      const spy = vitest.spyOn(prisma, '$transaction').mockRejectedValue(
        new PrismaClientKnownRequestError(
          'Transaction already closed: Could not perform operation.',
          {
            code: PRISMA_TRANSACTION_ERROR,
            clientVersion: '1',
          },
        ),
      )

      // When
      const resultWithDefaults = await prismaTransaction(prisma, (client) =>
        client.item1.create({ data: TEST_ITEM_1 }),
      )
      const resultWithCustomTimeout = await prismaTransaction(
        prisma,
        (client) => client.item1.create({ data: TEST_ITEM_1 }),
        { timeout: 1000, maxTimeout: 2000 },
      )

      // Then
      expect(resultWithDefaults.error).toBeInstanceOf(PrismaClientKnownRequestError)
      expect(resultWithCustomTimeout.error).toBeInstanceOf(PrismaClientKnownRequestError)
      expect(spy).toHaveBeenCalledTimes(6) // 3 per transaction call

      const callsOptions = spy.mock.calls.map(([_, options]) => options)
      expect(callsOptions).toMatchObject([
        // resultWithDefaults call
        { timeout: 5000 },
        { timeout: 10000 },
        { timeout: 20000 },
        // resultWithCustomTimeout call
        { timeout: 1000 },
        { timeout: 2000 },
        { timeout: 2000 },
      ])
    })

    it('CockroachDB retry transaction error is retried', async () => {
      // Given
      const retrySpy = vitest.spyOn(prisma, '$transaction').mockRejectedValue(
        new PrismaClientKnownRequestError('test', {
          code: 'P100',
          clientVersion: '1',
          meta: { code: '40001' },
        }),
      )

      // When
      const result = await prismaTransaction(
        prisma,
        (client) => client.item1.create({ data: TEST_ITEM_1 }),
        { DbDriver: 'CockroachDb' },
      )

      // Then
      expect(result.error).toBeInstanceOf(PrismaClientKnownRequestError)
      expect((result.error as PrismaClientKnownRequestError).meta).toMatchObject({
        code: '40001',
      })
      expect(retrySpy).toHaveBeenCalledTimes(3)
    })
  })

  describe('with array', () => {
    it('works', async () => {
      // When
      const result: Either<unknown, [Item1, Item2]> = await prismaTransaction(prisma, [
        prisma.item1.create({ data: TEST_ITEM_1 }),
        prisma.item2.create({ data: TEST_ITEM_2 }),
      ])

      // Then
      expect(result.result).toMatchObject([TEST_ITEM_1, TEST_ITEM_2])
    })

    it('returns proper types', async () => {
      // When
      const result = await prismaTransaction(prisma, [
        prisma.item1.create({ data: TEST_ITEM_1 }),
        prisma.item2.create({ data: TEST_ITEM_2 }),
      ])

      // Then
      expect(result.result).toMatchObject([TEST_ITEM_1, TEST_ITEM_2])
      expect(result.result![0].value).toBe(TEST_ITEM_1.value)
      expect(result.result![0].id).toBeDefined()
      expect(result.result![1].value).toBe(TEST_ITEM_2.value)
      expect(result.result![1].id).toBeDefined()
    })
  })
})
