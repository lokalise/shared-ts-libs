import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from 'prisma/client/client.ts'
import type * as Prometheus from 'prom-client'
import * as promClient from 'prom-client'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { cleanTables, DB_MODEL } from '../../test/DbCleaner.ts'
import { getDatasourceUrl } from '../../test/getDatasourceUrl.ts'
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

  describe('with metrics', () => {
    let prisma: PrismaClient
    let queriesTotal: Prometheus.Counter

    beforeAll(() => {
      prisma = prismaClientFactory(
        PrismaClient,
        { adapter: new PrismaPg({ connectionString: getDatasourceUrl() }) },
        { promClient },
      )

      queriesTotal = promClient.register.getSingleMetric(
        'prisma_queries_total',
      ) as Prometheus.Counter
    })

    beforeEach(async () => {
      await cleanTables(prisma, [DB_MODEL.item1])
    })

    afterAll(async () => {
      await prisma.$disconnect()
    })

    it('should have metrics registered in prometheus registry', () => {
      // When
      const metrics = promClient.register.getMetricsAsArray()
      const metricNames = metrics.map((m) => m.name)

      // Then
      expect(metricNames).toContain('prisma_queries_total')
      expect(metricNames).toContain('prisma_query_duration_seconds')
      expect(metricNames).toContain('prisma_errors_total')
    })

    it('should register query metrics', async () => {
      // Given
      const incSpy = vi.spyOn(queriesTotal, 'inc')

      // When
      const created = await prisma.item1.create({ data: { value: 'test-value' } })
      await prisma.item1.findUnique({ where: { id: created.id } })

      // Then - metrics should have been collected
      expect(incSpy).toHaveBeenCalledTimes(2)
    })
  })
})
