import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from 'db-client/client.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getDatasourceUrl } from '../../test/getDatasourceUrl.ts'
import { prismaTransaction } from './prismaTransaction.ts'

const transactionIsolationKey = 'transaction_isolation'

describe('prismaTransaction - isolation level', () => {
  let prisma: PrismaClient

  beforeAll(() => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: getDatasourceUrl() }),
    })
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  const extractIsolationLevel = (result: any) => {
    if (!result) return null
    if (Array.isArray(result)) return extractIsolationLevel(result[0])

    return result[transactionIsolationKey] ?? null
  }

  it('should have serializable as default', async () => {
    const res1 = await prismaTransaction(
      prisma,
      { dbDriver: 'CockroachDb' },
      async (client) => client.$queryRaw`SHOW transaction_isolation`,
    )
    const res2 = await prismaTransaction(prisma, { dbDriver: 'CockroachDb' }, [
      prisma.$queryRaw`SHOW transaction_isolation`,
    ])

    const result = [res1.result, res2.result].map(extractIsolationLevel)
    expect(result).toEqual(['serializable', 'serializable'])
  })

  it('should use serializable if specified', async () => {
    const res1 = await prismaTransaction(
      prisma,
      { isolationLevel: 'Serializable', dbDriver: 'CockroachDb' },
      async (client) => client.$queryRaw`SHOW transaction_isolation`,
    )
    const res2 = await prismaTransaction(
      prisma,
      { isolationLevel: 'Serializable', dbDriver: 'CockroachDb' },
      [prisma.$queryRaw`SHOW transaction_isolation`],
    )

    const result = [res1.result, res2.result].map(extractIsolationLevel)
    expect(result).toEqual(['serializable', 'serializable'])
  })

  it('should use read committed if specified', async () => {
    /**
     * Read committed isolation level is not supported by CockroachDB without enterprise license
     * So checking that proper isolation level is passed to the transaction method
     */
    const transactionSpy = vi.fn()
    const prisma = {
      $transaction: transactionSpy,
      $queryRaw: () => Promise.resolve(1) as any,
    } as unknown as PrismaClient

    await prismaTransaction(
      prisma,
      { isolationLevel: 'ReadCommitted', dbDriver: 'CockroachDb' },
      async () => undefined,
    )
    await prismaTransaction(prisma, { isolationLevel: 'ReadCommitted', dbDriver: 'CockroachDb' }, [
      prisma.$queryRaw`SELECT 1`,
    ])

    expect(transactionSpy).toHaveBeenCalledTimes(2)
    expect(transactionSpy.mock.calls.map(([, options]) => options)).toMatchObject([
      { isolationLevel: 'ReadCommitted' },
      { isolationLevel: 'ReadCommitted' },
    ])
  })
})
