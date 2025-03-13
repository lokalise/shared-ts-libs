import type { Either } from '@lokalise/node-core'
import { PrismaClient } from '@prisma/client'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { DB_MODEL, cleanTables } from '../test/DbCleaner.js'

import { getDatasourceUrl } from '../test/getDatasourceUrl.js'
import {
  PRISMA_NOT_FOUND_ERROR,
  PRISMA_SERIALIZATION_ERROR,
  PRISMA_SERVER_CLOSED_CONNECTION_ERROR,
  PRISMA_TRANSACTION_ERROR,
} from './errors/index.js'
import { prismaTransaction } from './prismaTransaction.js'

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
      datasourceUrl: getDatasourceUrl(),
    })
  })

  beforeEach(async () => {
    await cleanTables(prisma, [DB_MODEL.item1, DB_MODEL.item2])
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  describe('with function callback', () => {
    it('works in the first try', async () => {
      // When
      const result: Either<unknown, Item1> = await prismaTransaction(prisma, (client) =>
        client.item1.create({ data: TEST_ITEM_1 }),
      )

      // Then
      expect(result.result).toMatchObject(TEST_ITEM_1)
    })

    it('returns correct types for interactive transaction ', async () => {
      // When
      const result = await prismaTransaction(prisma, async (client) => {
        return await client.item1.create({ data: TEST_ITEM_1 })
      })

      // Then
      expect(result.result?.value).toBe(TEST_ITEM_1.value)
      expect(result.result?.id).toBeDefined()
    })

    it.each([
      PRISMA_SERIALIZATION_ERROR,
      PRISMA_SERVER_CLOSED_CONNECTION_ERROR,
      PRISMA_TRANSACTION_ERROR,
    ])('should retry prisma %s error', async (prismaErrorCode) => {
      // Given
      const callsTimestamps: number[] = []

      // When
      const result = await prismaTransaction(prisma, () => {
        callsTimestamps.push(Date.now())
        throw new PrismaClientKnownRequestError('test', {
          code: prismaErrorCode,
          clientVersion: '1',
        })
      })

      // Then
      expect(result.error).toBeInstanceOf(PrismaClientKnownRequestError)
      expect(result.error).toMatchObject({ code: prismaErrorCode })
      expect(callsTimestamps).toHaveLength(3)

      const diffs: number[] = []
      callsTimestamps.forEach((t, i) => {
        if (i > 0) diffs.push(Math.round((t - callsTimestamps[i - 1]!) / 100) * 100)
      })
      expect(diffs).toHaveLength(2)
      expect(diffs[0]).toBe(100)
      expect(diffs[1]).toBe(200)
    })

    it('should retry CockroachDB retry transaction error', async () => {
      // Given
      let callsCount = 0

      // When
      const result = await prismaTransaction(
        prisma,
        () => {
          callsCount++
          throw new PrismaClientKnownRequestError('test', {
            code: 'P100',
            clientVersion: '1',
            meta: { code: '40001' },
          })
        },
        { dbDriver: 'CockroachDb' },
      )

      // Then
      expect(result.error).toBeInstanceOf(PrismaClientKnownRequestError)
      expect((result.error as PrismaClientKnownRequestError).meta).toMatchObject({
        code: '40001',
      })
      expect(callsCount).toBe(3)
    })

    it('should not retry all prisma codes', async () => {
      // Given
      let callsCount = 0

      // When
      const result = await prismaTransaction(prisma, () => {
        callsCount++
        throw new PrismaClientKnownRequestError('test', {
          code: PRISMA_NOT_FOUND_ERROR,
          clientVersion: '1',
        })
      })

      // Then
      expect(result.error).toBeInstanceOf(PrismaClientKnownRequestError)
      expect((result.error as PrismaClientKnownRequestError).code).toBe(PRISMA_NOT_FOUND_ERROR)
      expect(callsCount).toBe(1)
    })

    it('should be possible to modify max number of retries and base delay', async () => {
      // Given
      const retriesAllowed = 4
      const baseRetryDelayMs = 100

      const callsTimestamps: number[] = []

      // When
      const result = await prismaTransaction(
        prisma,
        () => {
          callsTimestamps.push(Date.now())
          throw new PrismaClientKnownRequestError('test', {
            code: PRISMA_SERIALIZATION_ERROR,
            clientVersion: '1',
          })
        },
        { retriesAllowed, baseRetryDelayMs },
      )

      // Then
      expect(result.error).toBeInstanceOf(PrismaClientKnownRequestError)
      expect((result.error as PrismaClientKnownRequestError).code).toBe(PRISMA_SERIALIZATION_ERROR)
      expect(callsTimestamps).toHaveLength(5)

      const diffs: number[] = []
      callsTimestamps.forEach((t, i) => {
        if (i > 0) diffs.push(Math.round((t - callsTimestamps[i - 1]!) / 100) * 100)
      })
      expect(diffs).toEqual([100, 200, 400, 800])
    })

    it('should respect max retry delay', async () => {
      // Given
      const baseRetryDelayMs = 1000
      const maxRetryDelayMs = 100

      const callsTimestamps: number[] = []

      // When
      const result = await prismaTransaction(
        prisma,
        () => {
          callsTimestamps.push(Date.now())
          throw new PrismaClientKnownRequestError('test', {
            code: PRISMA_SERIALIZATION_ERROR,
            clientVersion: '1',
          })
        },
        { maxRetryDelayMs, baseRetryDelayMs },
      )

      // Then
      expect(result.error).toBeInstanceOf(PrismaClientKnownRequestError)
      expect((result.error as PrismaClientKnownRequestError).code).toBe(PRISMA_SERIALIZATION_ERROR)
      expect(callsTimestamps).toHaveLength(3)

      const diffs: number[] = []
      callsTimestamps.forEach((t, i) => {
        if (i > 0) diffs.push(Math.round((t - callsTimestamps[i - 1]!) / 100) * 100)
      })
      expect(diffs).toEqual([maxRetryDelayMs, maxRetryDelayMs])
    })

    it('should auto increase timeout', async () => {
      // Given
      const fakePrismaClient = {
        $transaction: () => undefined,
      } as unknown as PrismaClient
      const spy = vi.spyOn(fakePrismaClient, '$transaction').mockRejectedValue(
        new PrismaClientKnownRequestError(
          'Transaction already closed: Could not perform operation.',
          {
            code: PRISMA_TRANSACTION_ERROR,
            clientVersion: '1',
          },
        ),
      )

      // When
      const resultWithDefaults = await prismaTransaction(fakePrismaClient, () =>
        Promise.resolve(null),
      )
      const resultWithCustomTimeout = await prismaTransaction(
        fakePrismaClient,
        () => Promise.resolve(null),
        {
          timeout: 1000,
          maxTimeout: 2000,
        },
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

    it('should return proper types', async () => {
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
