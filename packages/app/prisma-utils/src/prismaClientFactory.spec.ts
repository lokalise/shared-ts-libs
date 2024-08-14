import type { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'
import { getDatasourceUrl } from '../test/getDatasourceUrl'
import { prismaClientFactory } from './prismaClientFactory'

describe('prismaClientFactory', () => {
  let prisma: PrismaClient

  afterEach(async () => {
    await prisma.$disconnect()
  })

  it('with default value', async () => {
    prisma = prismaClientFactory({ datasourceUrl: getDatasourceUrl() })

    expect(prisma).toBeDefined()
    expect(await prisma.item1.findMany()).toHaveLength(0)
  })

  it('overriding some options', async () => {
    prisma = prismaClientFactory({
      datasourceUrl: getDatasourceUrl(),
      transactionOptions: {
        isolationLevel: 'Serializable',
        timeout: 1000,
        maxWait: 1000,
      },
    })

    expect(prisma).toBeDefined()
    expect(await prisma.item1.findMany()).toHaveLength(0)
  })
})
