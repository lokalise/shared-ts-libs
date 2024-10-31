import { setTimeout } from 'node:timers/promises'

import { buildClient, sendGet } from '@lokalise/backend-http-client'
import type { FastifyInstance } from 'fastify'
import fastify from 'fastify'

import { metricsPlugin } from '@lokalise/fastify-extras'
import { generateMonotonicUuid } from '@lokalise/id-utils'
import { type Item1, PrismaClient } from '@prisma/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { DB_MODEL, cleanTables } from '../../test/DbCleaner'
import { getDatasourceUrl } from '../../test/getDatasourceUrl'
import { type PrismaMetricsPluginOptions, prismaMetricsPlugin } from './prismaMetricsPlugin'

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
  id: generateMonotonicUuid(),
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

async function getMetrics() {
  return await sendGet(buildClient('http://127.0.0.1:9080'), '/metrics', {
    requestLabel: 'test',
    responseSchema: UNKNOWN_RESPONSE_SCHEMA,
  })
}

describe('prismaMetricsPlugin', () => {
  let app: FastifyInstance
  let prisma: PrismaClient

  beforeAll(() => {
    prisma = new PrismaClient({
      datasourceUrl: getDatasourceUrl(),
    })
  })

  beforeEach(async () => {
    await cleanTables(prisma, [DB_MODEL.item1, DB_MODEL.item2])
  })

  afterEach(async () => {
    if (app) await app.close()
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

    const responseBefore = await getMetrics()
    expect(responseBefore.result.body).not.toContain('prisma_pool_connections_opened_total 1')

    // prisma call
    await prisma.item1.create({ data: TEST_ITEM_1 })

    await setTimeout(100)

    await app.prismaMetrics.collect()

    const responseAfter = await getMetrics()
    expect(responseAfter.result.body).toContain('prisma_pool_connections_opened_total 1')
  })
  it('scheduler collects metrics', async () => {
    app = await initAppWithPrismaMetrics(
      { prisma },
      {
        enableMetricsPlugin: true,
        collectionOptions: {
          type: 'interval',
          intervalInMs: 500,
        },
      },
    )

    const responseBefore = await getMetrics()
    expect(responseBefore.result.body).not.toContain('prisma_pool_connections_opened_total 1')

    // prisma call
    await prisma.item1.create({ data: TEST_ITEM_1 })

    // Wait for collector to collect metrics
    await setTimeout(100)

    const responseAfter = await getMetrics()
    expect(responseAfter.result.body).toContain('prisma_pool_connections_opened_total 1')
  })
})
