import { setTimeout } from 'node:timers/promises'

import { buildClient, sendGet } from '@lokalise/backend-http-client'
import type { FastifyInstance } from 'fastify'
import fastify from 'fastify'

import { PrismaClient } from '@prisma/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { DB_MODEL, cleanTables } from '../../test/DbCleaner'
import { getDatasourceUrl } from '../../test/getDatasourceUrl'
import { type PrismaMetricsPluginOptions, prismaMetricsPlugin } from './prismaMetricsPlugin'

const UNKNOWN_RESPONSE_SCHEMA = z.unknown()

async function initAppWithPrismaMetrics(pluginOptions: PrismaMetricsPluginOptions) {
  const app = fastify()

  await app.register(prismaMetricsPlugin, {
    collectionOptions: { type: 'manual' },
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
      return initAppWithPrismaMetrics({ prisma })
    }).rejects.toThrowError(
      'No Prometheus Client found, BullMQ metrics plugin requires `fastify-metrics` plugin to be registered',
    )
  })

  it('exposes metrics collect() function', async () => {
    app = await initAppWithPrismaMetrics({ prisma })

    // exec collect to start listening for failed and completed events
    await app.prismaMetrics.collect()

    const responseBefore = await getMetrics()
    expect(responseBefore.result.body).not.toContain(
      'bullmq_jobs_finished_duration_count{status="completed",queue="test_job"} 1',
    )

    // prisma call

    await setTimeout(100)

    await app.prismaMetrics.collect()

    const responseAfter = await getMetrics()
    expect(responseAfter.result.body).toContain(
      'bullmq_jobs_finished_duration_count{status="completed",queue="test_job"} 1',
    )
  })
})
