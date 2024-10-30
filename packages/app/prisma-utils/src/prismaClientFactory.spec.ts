import { PrismaClient } from '@prisma/client'
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DB_MODEL, cleanTables } from '../test/DbCleaner'
import { getDatasourceUrl } from '../test/getDatasourceUrl'
import { prismaClientFactory } from './prismaClientFactory'

describe('prismaClientFactory', () => {
  describe('real prisma client', () => {
    let prisma: PrismaClient

    beforeEach(async () => {
      await cleanTables(prisma, [DB_MODEL.item1, DB_MODEL.item2])
    })

    afterEach(async () => {
      await prisma.$disconnect()
    })

    it('with default value', async () => {
      prisma = prismaClientFactory(PrismaClient, {
        datasourceUrl: getDatasourceUrl(),
      })

      expect(prisma).toBeDefined()
      expect(await prisma.item1.findMany()).toBeDefined()
    })

    it('overriding some options', async () => {
      prisma = prismaClientFactory(PrismaClient, {
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

  describe('mocking PrismaClient', () => {
    let mockPrismaClient: Mock<any>

    beforeEach(() => {
      mockPrismaClient = vi.fn<any>()
    })

    it('default options', () => {
      prismaClientFactory(mockPrismaClient)

      expect(mockPrismaClient).toHaveBeenCalledWith({
        transactionOptions: { isolationLevel: 'ReadCommitted' },
      })
    })

    it('changing transaction options but not isolation level', () => {
      prismaClientFactory(mockPrismaClient, {
        transactionOptions: {
          maxWait: 1000,
          timeout: 1000,
        },
      })

      expect(mockPrismaClient).toHaveBeenCalledWith({
        transactionOptions: {
          isolationLevel: 'ReadCommitted',
          maxWait: 1000,
          timeout: 1000,
        },
      })
    })

    it('setting other options', () => {
      prismaClientFactory(mockPrismaClient, {
        datasourceUrl: getDatasourceUrl(),
        errorFormat: 'colorless',
        log: ['query'],
      })

      expect(mockPrismaClient).toHaveBeenCalledWith({
        transactionOptions: { isolationLevel: 'ReadCommitted' },
        datasourceUrl: getDatasourceUrl(),
        errorFormat: 'colorless',
        log: ['query'],
      })
    })
  })
})
