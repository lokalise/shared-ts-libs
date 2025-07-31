import { constants as httpConstants } from 'node:http2'
import { createBullBoard } from '@bull-board/api'
// @ts-ignore
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js'
import { FastifyAdapter } from '@bull-board/fastify'
import fastifySchedule from '@fastify/schedule'
import {
  backgroundJobProcessorGetActiveQueueIds,
  createSanitizedRedisClient,
  QUEUE_GROUP_DELIMITER,
} from '@lokalise/background-jobs-common'
import { type RedisConfig, resolveGlobalErrorLogObject } from '@lokalise/node-core'
import type { Queue, QueueOptions, RedisConnection } from 'bullmq'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import type { Redis } from 'ioredis'
import { AsyncTask, SimpleIntervalJob } from 'toad-scheduler'

export type BullBoardOptions = {
  queueConstructor: QueueProConstructor | QueueConstructor
  basePath: string
  refreshIntervalInSeconds?: number
} & (
  | {
      redisInstances: Redis[]
      redisConfigs?: never
    }
  | {
      redisInstances?: never
      redisConfigs: RedisConfig[]
    }
)

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

export interface QueueConstructor {
  new (name: string, opts?: QueueOptions, Connection?: typeof RedisConnection): Queue
}

async function getCurrentQueues(
  redisInstances: Redis[],
  queueConstructor: QueueProConstructor | QueueConstructor,
): Promise<BullMQAdapter[]> {
  const queueIds = await Promise.all(
    redisInstances.map((redis) => backgroundJobProcessorGetActiveQueueIds(redis)),
  )

  return queueIds
    .flatMap((ids, index) =>
      // biome-ignore lint/style/noNonNullAssertion: Should exist
      ids.map((id) => new queueConstructor(id, { connection: redisInstances[index]! })),
    )
    .map((queue) => new BullMQAdapter(queue, { delimiter: QUEUE_GROUP_DELIMITER }))
}

async function scheduleUpdates(
  fastify: FastifyInstance,
  bullBoard: ReturnType<typeof createBullBoard>,
  resolvedRedisInstances: Redis[],
  pluginOptions: BullBoardOptions,
) {
  const { refreshIntervalInSeconds, queueConstructor } = pluginOptions

  if (!refreshIntervalInSeconds || refreshIntervalInSeconds <= 0) return

  const refreshTask = new AsyncTask(
    'Bull-board - update queues',
    async () => {
      fastify.log.debug({ refreshIntervalInSeconds }, 'Bull-dashboard -> updating queues')
      bullBoard.replaceQueues(await getCurrentQueues(resolvedRedisInstances, queueConstructor))
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

const resolveRedisInstances = (options: BullBoardOptions): Redis[] => {
  if (options.redisInstances) return options.redisInstances
  if (options.redisConfigs) return options.redisConfigs.map(createSanitizedRedisClient)

  throw new Error('Either `redisInstances` or `redisConfigs` must be provided in BullBoardOptions')
}

const plugin = async (fastify: FastifyInstance, pluginOptions: BullBoardOptions) => {
  const { basePath, queueConstructor } = pluginOptions
  const resolvedRedisInstances = resolveRedisInstances(pluginOptions)

  const serverAdapter = new FastifyAdapter()
  const bullBoard = createBullBoard({
    queues: await getCurrentQueues(resolvedRedisInstances, queueConstructor),
    serverAdapter,
  })
  // biome-ignore lint/suspicious/noExplicitAny: bull-board is not exporting this type
  serverAdapter.setErrorHandler(bullBoardErrorHandler as any)
  serverAdapter.setBasePath(basePath)

  await fastify.register(serverAdapter.registerPlugin(), {
    prefix: basePath,
  })

  await scheduleUpdates(fastify, bullBoard, resolvedRedisInstances, pluginOptions)
}

export const bullBoard = fp<BullBoardOptions>(plugin, {
  fastify: '>=4.0.0',
  name: 'bull-board',
})
