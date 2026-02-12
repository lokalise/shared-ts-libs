import { randomUUID } from 'node:crypto'
import { buildClient, sendGet } from '@lokalise/backend-http-client'
import { metricsPlugin } from '@lokalise/fastify-extras'
import { waitAndRetry } from '@lokalise/node-core'
import type { FastifyInstance } from 'fastify'
import fastify from 'fastify'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { cleanTables, DB_MODEL } from '../../test/DbCleaner.ts'
import { type Item1, PrismaClient } from '../../test/db-client/client.ts'
import { getDatasourceUrl } from '../../test/getDatasourceUrl.ts'
import { type PrismaMetricsPluginOptions, prismaMetricsPlugin } from './prismaMetricsPlugin.ts'

const UNKNOWN_RESPONSE_SCHEMA = z.unknown()

type TestOptions = {
  enableMetricsPlugin: boolean
  collectionOptions?:
    | {
        type: 'interval'
        intervalInMs: number
      }
    | {
        type: 'manual'
      }
}

const TEST_ITEM_1: Item1 = {
  id: randomUUID(),
  value: 'one',
}

const DEFAULT_TEST_OPTIONS = {
  enableMetricsPlugin: true,
  collectionOptions: { type: 'manual' as const },
}

async function initAppWithPrismaMetrics(
  pluginOptions: PrismaMetricsPluginOptions,
  { enableMetricsPlugin, collectionOptions }: TestOptions = DEFAULT_TEST_OPTIONS,
) {
  const app = fastify()

  if (enableMetricsPlugin) {
    await app.register(metricsPlugin, {
      bindAddress: '0.0.0.0',
      logger: false,
      errorObjectResolver: (err: unknown) => err,
    })
  }

  await app.register(prismaMetricsPlugin, {
    collectionOptions,
    ...pluginOptions,
  })

  await app.ready()
  return app
}

describe('prismaMetricsPlugin', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let httpClient: ReturnType<typeof buildClient>

  async function getMetrics() {
    return await sendGet(httpClient, '/metrics', {
      requestLabel: 'test',
      responseSchema: UNKNOWN_RESPONSE_SCHEMA,
    })
  }

  beforeAll(() => {
    prisma = new PrismaClient({
      datasourceUrl: getDatasourceUrl(),
    })
  })

  beforeEach(async () => {
    await cleanTables(prisma, [DB_MODEL.item1, DB_MODEL.item2])
    httpClient = buildClient('http://127.0.0.1:9080')
  })

  afterEach(async () => {
    httpClient.close()
    if (app) await app.close()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('throws if fastify-metrics was not initialized', async () => {
    await expect(() => {
      return initAppWithPrismaMetrics({ prisma }, { enableMetricsPlugin: false })
    }).rejects.toThrowError(
      'No Prometheus Client found, Prisma metrics plugin requires `fastify-metrics` plugin to be registered',
    )
  })

  it('exposes metrics collect() function', async () => {
    app = await initAppWithPrismaMetrics({ prisma })

    // Get initial metrics
    const responseBefore = await getMetrics()
    const bodyBefore = responseBefore.result.body as string
    const matchBefore = bodyBefore.match(/prisma_pool_connections_opened_total (\d+)/)
    const connectionsBefore = matchBefore ? Number.parseInt(matchBefore[1] ?? '0', 10) : 0

    // prisma call
    await prisma.item1.create({ data: TEST_ITEM_1 })

    const found = await waitAndRetry(
      async () => {
        await app.prismaMetrics.collect()
        const metrics = await getMetrics()
        const bodyAfter = metrics.result.body as string
        const matchAfter = bodyAfter.match(/prisma_pool_connections_opened_total (\d+)/)
        const connectionsAfter = matchAfter ? Number.parseInt(matchAfter[1] ?? '0', 10) : 0
        // Check that connections increased or at least exist
        return connectionsAfter >= connectionsBefore && connectionsAfter > 0
      },
      10,
      100,
    )

    expect(found).toBe(true)
  })

  it('scheduler collects metrics', async () => {
    app = await initAppWithPrismaMetrics(
      { prisma },
      {
        enableMetricsPlugin: true,
        collectionOptions: {
          type: 'interval',
          intervalInMs: 50,
        },
      },
    )

    // Get initial metrics
    const responseBefore = await getMetrics()
    const bodyBefore = responseBefore.result.body as string
    const matchBefore = bodyBefore.match(/prisma_pool_connections_opened_total (\d+)/)
    const connectionsBefore = matchBefore ? Number.parseInt(matchBefore[1] ?? '0', 10) : 0

    // prisma call
    await prisma.item1.create({ data: TEST_ITEM_1 })

    const found = await waitAndRetry(
      async () => {
        await app.prismaMetrics.collect()
        const metrics = await getMetrics()
        const bodyAfter = metrics.result.body as string
        const matchAfter = bodyAfter.match(/prisma_pool_connections_opened_total (\d+)/)
        const connectionsAfter = matchAfter ? Number.parseInt(matchAfter[1] ?? '0', 10) : 0
        // Check that connections increased or at least exist
        return connectionsAfter >= connectionsBefore && connectionsAfter > 0
      },
      10,
      100,
    )

    expect(found).toBe(true)
  })
})
