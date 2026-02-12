import { PrismaPg } from '@prisma/adapter-pg'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { PrismaClient } from '../test/db-client/client.ts'
import { getDatasourceUrl } from '../test/getDatasourceUrl.ts'
import { prismaClientFactory } from './prismaClientFactory.ts'

describe('prismaClientFactory', () => {
  describe('real prisma client', () => {
    let prisma: PrismaClient

    afterEach(async () => {
      await prisma.$disconnect()
    })

    it('with default value', async () => {
      prisma = prismaClientFactory(PrismaClient, {
        adapter: new PrismaPg({ connectionString: getDatasourceUrl() }),
      })

      expect(prisma).toBeDefined()
      expect(await prisma.item1.findMany()).toBeDefined()
    })

    it('overriding some options', async () => {
      prisma = prismaClientFactory(PrismaClient, {
        adapter: new PrismaPg({ connectionString: getDatasourceUrl() }),
        transactionOptions: {
          isolationLevel: 'Serializable',
          timeout: 1000,
          maxWait: 1000,
        },
      })

      expect(prisma).toBeDefined()
      expect(await prisma.item1.findMany()).toBeDefined()
    })
  })

  describe('mocking PrismaClient', () => {
    let mockPrismaClient: Mock<any>

    beforeEach(() => {
      mockPrismaClient = vi.fn<any>()
    })

    it('default options', () => {
      prismaClientFactory(mockPrismaClient, { adapter: new PrismaPg({ connectionString: '' }) })

      expect(mockPrismaClient).toHaveBeenCalledWith({
        adapter: expect.any(PrismaPg),
        transactionOptions: { isolationLevel: 'ReadCommitted' },
      })
    })

    it('changing transaction options but not isolation level', () => {
      prismaClientFactory(mockPrismaClient, {
        adapter: new PrismaPg({ connectionString: '' }),
        transactionOptions: {
          maxWait: 1000,
          timeout: 1000,
        },
      })

      expect(mockPrismaClient).toHaveBeenCalledWith({
        adapter: expect.any(PrismaPg),
        transactionOptions: {
          isolationLevel: 'ReadCommitted',
          maxWait: 1000,
          timeout: 1000,
        },
      })
    })

    it('setting other options', () => {
      prismaClientFactory(mockPrismaClient, {
        adapter: new PrismaPg({ connectionString: '' }),
        errorFormat: 'colorless',
        log: ['query'],
      })

      expect(mockPrismaClient).toHaveBeenCalledWith({
        adapter: expect.any(PrismaPg),
        transactionOptions: { isolationLevel: 'ReadCommitted' },
        errorFormat: 'colorless',
        log: ['query'],
      })
    })
  })
})
