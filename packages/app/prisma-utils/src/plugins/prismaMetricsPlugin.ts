import type { FastifyInstance, FastifyPluginCallback } from 'fastify'
import 'fastify-metrics'
import fp from 'fastify-plugin'

import type { PrismaClient } from '@prisma/client'
import type { CollectionScheduler } from './CollectionScheduler.js'
import { PromiseBasedCollectionScheduler } from './CollectionScheduler.js'
import type { MetricCollectorOptions } from './MetricsCollector.js'
import { MetricsCollector } from './MetricsCollector.js'

// Augment existing FastifyRequest interface with new fields
declare module 'fastify' {
  interface FastifyInstance {
    prismaMetrics: {
      collect: () => Promise<void>
    }
  }
}

export type PrismaMetricsPluginOptions = {
  prisma: PrismaClient
  collectionOptions?:
    | {
        type: 'interval'
        intervalInMs: number
      }
    | {
        type: 'manual'
      }
} & Partial<MetricCollectorOptions>

function plugin(
  fastify: FastifyInstance,
  pluginOptions: PrismaMetricsPluginOptions,
  next: (err?: Error) => void,
) {
  if (!fastify.metrics) {
    return next(
      new Error(
        'No Prometheus Client found, Prisma metrics plugin requires `fastify-metrics` plugin to be registered',
      ),
    )
  }

  const options = {
    collectionOptions: {
      type: 'interval',
      intervalInMs: 5000,
    },
    ...pluginOptions,
    metricsPrefix: 'prisma',
  } satisfies PrismaMetricsPluginOptions

  try {
    const collector = new MetricsCollector(
      options.prisma,
      options,
      fastify.metrics.client.register,
      fastify.log,
    )
    const collectFn = async () => await collector.collect(options.metricsPrefix)
    let scheduler: CollectionScheduler

    if (options.collectionOptions.type === 'interval') {
      scheduler = new PromiseBasedCollectionScheduler(
        options.collectionOptions.intervalInMs,
        collectFn,
      )

      // Void is set so the scheduler can run indefinitely
      void scheduler.start()
    }

    fastify.addHook('onClose', async () => {
      if (scheduler) {
        scheduler.stop()
      }
      await collector.dispose()
    })

    fastify.decorate('prismaMetrics', {
      collect: collectFn,
    })

    next()
    /* c8 ignore start */
  } catch (err: unknown) {
    return next(
      err instanceof Error
        ? err
        : new Error('Unknown error in prisma-metrics-plugin', { cause: err }),
    )
  }
  /* c8 ignore stop */
}

export const prismaMetricsPlugin: FastifyPluginCallback<PrismaMetricsPluginOptions> =
  fp<PrismaMetricsPluginOptions>(plugin, {
    fastify: '5.x',
    name: 'prisma-metrics-plugin',
  })
