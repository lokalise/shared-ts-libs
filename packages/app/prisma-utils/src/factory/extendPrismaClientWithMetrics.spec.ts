import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClientKnownRequestError } from 'prisma/client//internal/prismaNamespace.ts'
import { PrismaClient } from 'prisma/client/client.ts'
import type * as Prometheus from 'prom-client'
import * as promClient from 'prom-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanTables, DB_MODEL } from '../../test/DbCleaner.ts'
import { getDatasourceUrl } from '../../test/getDatasourceUrl.ts'
import { extendPrismaClientWithMetrics } from './extendPrismaClientWithMetrics.ts'

const TEST_ITEM = {
  value: 'test-value',
}

describe('extendPrismaClientWithMetrics', () => {
  let prisma: PrismaClient
  let queriesTotal: Prometheus.Counter
  let queryDuration: Prometheus.Histogram
  let errorsTotal: Prometheus.Counter

  beforeAll(() => {
    const basePrisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: getDatasourceUrl() }),
    })

    prisma = extendPrismaClientWithMetrics(basePrisma, promClient)

    // Get the metrics from the global registry
    queriesTotal = promClient.register.getSingleMetric('prisma_queries_total') as Prometheus.Counter
    queryDuration = promClient.register.getSingleMetric(
      'prisma_query_duration_seconds',
    ) as Prometheus.Histogram
    errorsTotal = promClient.register.getSingleMetric('prisma_errors_total') as Prometheus.Counter
  })

  beforeEach(async () => {
    await cleanTables(prisma, [DB_MODEL.item1])
    vi.clearAllMocks()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('should save metrics for successful operations', async () => {
    // Given
    const incSpy = vi.spyOn(queriesTotal, 'inc')
    const observeSpy = vi.spyOn(queryDuration, 'observe')
    const errorsSpy = vi.spyOn(errorsTotal, 'inc')

    // When
    const created1 = await prisma.item1.create({ data: TEST_ITEM })
    await prisma.item1.findUnique({ where: { id: created1.id } })
    await prisma.item1.update({ where: { id: created1.id }, data: { value: 'updated' } })
    await prisma.item1.delete({ where: { id: created1.id } })

    const created2 = await prisma.item2.create({ data: TEST_ITEM })
    await prisma.item2.findUnique({ where: { id: created2.id } })
    await prisma.item2.update({ where: { id: created2.id }, data: { value: 'updated' } })
    await prisma.item2.delete({ where: { id: created2.id } })

    // Then
    expect(errorsSpy).not.toHaveBeenCalled()

    expect(incSpy).toHaveBeenCalledTimes(8)
    expect(observeSpy).toHaveBeenCalledTimes(8)
    const models = ['Item1', 'Item2']
    const operations = ['create', 'findUnique', 'update', 'delete']
    for (const model of models) {
      for (const operation of operations) {
        expect(incSpy).toHaveBeenCalledWith({
          model,
          operation,
          status: 'success',
        })
        expect(observeSpy).toHaveBeenCalledWith({ model, operation }, expect.any(Number))
      }
    }
  })

  it('should save metrics for failed operations', async () => {
    // Given
    const incSpy = vi.spyOn(queriesTotal, 'inc')
    const observeSpy = vi.spyOn(queryDuration, 'observe')
    const errorsSpy = vi.spyOn(errorsTotal, 'inc')

    // When
    try {
      await prisma.item1.findUniqueOrThrow({ where: { id: '1' } })
      expect.fail('findUniqueOrThrow should have thrown an error for non-existing record')
    } catch (err) {
      expect(err).toBeInstanceOf(PrismaClientKnownRequestError)
    }

    // Then
    expect(incSpy).toHaveBeenCalledTimes(1)
    expect(incSpy).toHaveBeenCalledWith({
      model: 'Item1',
      operation: 'findUniqueOrThrow',
      status: 'error',
    })

    expect(observeSpy).toHaveBeenCalledTimes(1)
    expect(observeSpy).toHaveBeenCalledWith(
      { model: 'Item1', operation: 'findUniqueOrThrow' },
      expect.any(Number),
    )

    expect(errorsSpy).toHaveBeenCalledTimes(1)
    expect(errorsSpy).toHaveBeenCalledWith({
      model: 'Item1',
      operation: 'findUniqueOrThrow',
      error_code: expect.any(String),
    })
  })

  it('should reuse existing metrics', () => {
    // Given - first extension already created in beforeAll
    const metrics = promClient.register.getMetricsAsArray()

    // When - create another extended client from base client
    extendPrismaClientWithMetrics(prisma, promClient)

    // Then - should not create duplicate metrics
    expect(metrics).toEqual(promClient.register.getMetricsAsArray())
  })
})
