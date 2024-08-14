import { PrismaClient } from '@prisma/client'
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDatasourceUrl } from '../test/getDatasourceUrl'
import { prismaClientFactory } from './prismaClientFactory'

describe('prismaClientFactory', () => {
  let prisma: PrismaClient

  describe('PrismaClient is returned and works', () => {
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

  describe('checking init options', () => {
    vi.mock('@prisma/client', () => {
      return {
        PrismaClient: vi.fn(),
      }
    })

    let mockPrismaClient: MockInstance
    beforeEach(() => {
      mockPrismaClient = PrismaClient as unknown as MockInstance
    })

    it('default options', () => {
      prisma = prismaClientFactory()

      expect(mockPrismaClient).toHaveBeenCalledWith({
        transactionOptions: { isolationLevel: 'ReadCommitted' },
      })
    })

    it('changing transaction options but not isolation level', () => {
      prisma = prismaClientFactory({
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
      prisma = prismaClientFactory({
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
