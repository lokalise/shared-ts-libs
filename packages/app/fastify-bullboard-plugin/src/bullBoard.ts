import { constants as httpConstants } from 'node:http2'
import { createBullBoard } from '@bull-board/api'
// @ts-ignore
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js'
import { FastifyAdapter } from '@bull-board/fastify'
import fastifySchedule from '@fastify/schedule'
import {
  QUEUE_GROUP_DELIMITER,
  backgroundJobProcessorGetActiveQueueIds,
} from '@lokalise/background-jobs-common'
import { resolveGlobalErrorLogObject } from '@lokalise/node-core'
import type { Queue } from 'bullmq'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import type { Redis } from 'ioredis'
import { AsyncTask, SimpleIntervalJob } from 'toad-scheduler'

export type BullBoardOptions = {
  queueProConstructor: QueueProConstructor
  redisInstances: Redis[]
  basePath: string
  refreshIntervalInSeconds?: number
}

function containStatusCode(error: Error): error is Error & { statusCode: number } {
  return Object.hasOwn(error, 'statusCode')
}

const bullBoardErrorHandler = (error: Error) => {
  const status = containStatusCode(error)
    ? error.statusCode
    : httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR
  return {
    status: status,
    body: { message: error.message, details: error.stack },
  }
}

export interface QueueProConstructor {
  new (name: string, opts?: Record<string, unknown>): Queue
}

async function getCurrentQueues(
  redisInstances: Redis[],
  QueuePro: QueueProConstructor,
): Promise<BullMQAdapter[]> {
  const queueIds = await Promise.all(
    redisInstances.map((redis) => backgroundJobProcessorGetActiveQueueIds(redis)),
  )

  return queueIds
    .flatMap((ids, index) =>
      // biome-ignore lint/style/noNonNullAssertion: Should exist
      ids.map((id) => new QueuePro(id, { connection: redisInstances[index]! })),
    )
    .map((queue) => new BullMQAdapter(queue, { delimiter: QUEUE_GROUP_DELIMITER }))
}

async function scheduleUpdates(
  fastify: FastifyInstance,
  bullBoard: ReturnType<typeof createBullBoard>,
  pluginOptions: BullBoardOptions,
) {
  const { refreshIntervalInSeconds, redisInstances, queueProConstructor } = pluginOptions

  if (!refreshIntervalInSeconds || refreshIntervalInSeconds <= 0) return

  const refreshTask = new AsyncTask(
    'Bull-board - update queues',
    async () => {
      fastify.log.debug({ refreshIntervalInSeconds }, 'Bull-dashboard -> updating queues')
      bullBoard.replaceQueues(await getCurrentQueues(redisInstances, queueProConstructor))
    },
    (e) => fastify.log.error(resolveGlobalErrorLogObject(e)),
  )

  await fastify.register(fastifySchedule)
  fastify.scheduler.addSimpleIntervalJob(
    new SimpleIntervalJob({ seconds: refreshIntervalInSeconds }, refreshTask, {
      id: 'bull-board-queues-update',
      preventOverrun: true,
    }),
  )
}

const plugin = async (fastify: FastifyInstance, pluginOptions: BullBoardOptions) => {
  const { basePath, redisInstances, queueProConstructor } = pluginOptions

  const serverAdapter = new FastifyAdapter()
  const bullBoard = createBullBoard({
    queues: await getCurrentQueues(redisInstances, queueProConstructor),
    serverAdapter,
  })
  // biome-ignore lint/suspicious/noExplicitAny: bull-board is not exporting this type
  serverAdapter.setErrorHandler(bullBoardErrorHandler as any)
  serverAdapter.setBasePath(basePath)

  await fastify.register(serverAdapter.registerPlugin(), {
    prefix: basePath,
  })

  await scheduleUpdates(fastify, bullBoard, pluginOptions)
}

export const bullBoard = fp<BullBoardOptions>(plugin, {
  fastify: '>=4.0.0',
  name: 'bull-board',
})
