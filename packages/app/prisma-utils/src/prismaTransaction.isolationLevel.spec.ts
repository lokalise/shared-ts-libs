import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vitest } from 'vitest'
import { getDatasourceUrl } from '../test/getDatasourceUrl.ts'
import { prismaTransaction } from './prismaTransaction.ts'

const transactionIsolationKey = 'transaction_isolation'

describe('prismaTransaction - isolation level', () => {
  let prisma: PrismaClient

  beforeAll(() => {
    prisma = new PrismaClient({
      datasourceUrl: getDatasourceUrl(),
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
      async (client) => client.$queryRaw`SHOW transaction_isolation`,
    )
    const res2 = await prismaTransaction(prisma, [prisma.$queryRaw`SHOW transaction_isolation`])

    const result = [res1.result, res2.result].map(extractIsolationLevel)
    expect(result).toEqual(['serializable', 'serializable'])
  })

  it('should use serializable if specified', async () => {
    const res1 = await prismaTransaction(
      prisma,
      async (client) => client.$queryRaw`SHOW transaction_isolation`,
      { isolationLevel: 'Serializable' },
    )
    const res2 = await prismaTransaction(prisma, [prisma.$queryRaw`SHOW transaction_isolation`], {
      isolationLevel: 'Serializable',
    })

    const result = [res1.result, res2.result].map(extractIsolationLevel)
    expect(result).toEqual(['serializable', 'serializable'])
  })

  it('should use read committed if specified', async () => {
    /**
     * Read committed isolation level is not supported by CockroachDB without enterprise license
     * So checking that proper isolation level is passed to the transaction method
     */
    const transactionSpy = vitest.spyOn(prisma, '$transaction')

    await prismaTransaction(
      prisma,
      async (client) => client.$queryRaw`SHOW transaction_isolation`,
      { isolationLevel: 'ReadCommitted' },
    )
    await prismaTransaction(prisma, [prisma.$queryRaw`SHOW transaction_isolation`], {
      isolationLevel: 'ReadCommitted',
    })

    expect(transactionSpy).toHaveBeenCalledTimes(2)
    expect(transactionSpy.mock.calls.map(([, options]) => options)).toMatchObject([
      { isolationLevel: 'ReadCommitted' },
      { isolationLevel: 'ReadCommitted' },
    ])
  })
})
