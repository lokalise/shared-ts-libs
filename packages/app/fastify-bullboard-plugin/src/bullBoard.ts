import { constants as httpConstants } from 'node:http2'
import { createBullBoard } from '@bull-board/api'
// @ts-ignore
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js'
import { FastifyAdapter } from '@bull-board/fastify'
import fastifySchedule from '@fastify/schedule'
import {
  backgroundJobProcessorGetActiveQueueIds,
  QUEUE_GROUP_DELIMITER,
  sanitizeRedisConfig,
} from '@lokalise/background-jobs-common'
import { type RedisConfig, resolveGlobalErrorLogObject } from '@lokalise/node-core'
import type { Queue, QueueOptions, RedisConnection } from 'bullmq'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { Redis } from 'ioredis'
import { AsyncTask, SimpleIntervalJob } from 'toad-scheduler'

export type BullBoardOptions = {
  queueConstructor: QueueProConstructor | QueueConstructor
  basePath: string
  refreshIntervalInSeconds?: number
  redisConfigs: RedisConfig[]
}

type ResolvedRedis = { redis: Redis; prefix: string | undefined }
let currentQueues: Queue[] = []

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
  resolvedRedis: ResolvedRedis[],
  queueConstructor: QueueProConstructor | QueueConstructor,
) {
  const queueIds = await Promise.all(
    resolvedRedis.map((e) => backgroundJobProcessorGetActiveQueueIds(e.redis)),
  )

  const queues = queueIds.flatMap((ids, index) =>
    ids.map((id) => {
      // biome-ignore lint/style/noNonNullAssertion: Should exist
      const redisConfig = resolvedRedis[index]!
      return new queueConstructor(id, { connection: redisConfig.redis, prefix: redisConfig.prefix })
    }),
  )

  return {
    queues,
    queuesAdapter: queues.map(
      (queue) => new BullMQAdapter(queue, { delimiter: QUEUE_GROUP_DELIMITER }),
    ),
  }
}

const replaceQueues = async (
  fastify: FastifyInstance,
  bullBoard: ReturnType<typeof createBullBoard>,
  resolvedRedis: ResolvedRedis[],
  pluginOptions: BullBoardOptions,
) => {
  const { refreshIntervalInSeconds, queueConstructor } = pluginOptions

  fastify.log.debug({ refreshIntervalInSeconds }, 'Bull-dashboard -> updating queues')
  const { queues: newQueues, queuesAdapter } = await getCurrentQueues(
    resolvedRedis,
    queueConstructor,
  )
  bullBoard.replaceQueues(queuesAdapter)
  await Promise.all(currentQueues.map((queue) => queue.disconnect()))
  currentQueues = newQueues
}

async function scheduleUpdates(
  fastify: FastifyInstance,
  bullBoard: ReturnType<typeof createBullBoard>,
  resolvedRedis: ResolvedRedis[],
  pluginOptions: BullBoardOptions,
) {
  const { refreshIntervalInSeconds } = pluginOptions

  if (!refreshIntervalInSeconds || refreshIntervalInSeconds <= 0) return

  const refreshTask = new AsyncTask(
    'Bull-board - update queues',
    () => replaceQueues(fastify, bullBoard, resolvedRedis, pluginOptions),
    (e) => fastify.log.error(resolveGlobalErrorLogObject(e)),
  )

  // if scheduler is not registered, register it
  if (!fastify.scheduler) await fastify.register(fastifySchedule)

  fastify.scheduler.addSimpleIntervalJob(
    new SimpleIntervalJob({ seconds: refreshIntervalInSeconds }, refreshTask, {
      id: 'bull-board-queues-update',
      preventOverrun: true,
    }),
  )
}

const resolveRedis = (options: BullBoardOptions): ResolvedRedis[] =>
  options.redisConfigs.map((config) => ({
    redis: new Redis(sanitizeRedisConfig(config)),
    prefix: config.keyPrefix,
  }))

const plugin = async (fastify: FastifyInstance, pluginOptions: BullBoardOptions) => {
  const { basePath, queueConstructor } = pluginOptions
  const resolvedRedis = resolveRedis(pluginOptions)

  const serverAdapter = new FastifyAdapter()
  const { queues, queuesAdapter } = await getCurrentQueues(resolvedRedis, queueConstructor)
  const bullBoard = createBullBoard({
    queues: queuesAdapter,
    serverAdapter,
  })
  currentQueues = queues

  // biome-ignore lint/suspicious/noExplicitAny: bull-board is not exporting this type
  serverAdapter.setErrorHandler(bullBoardErrorHandler as any)
  serverAdapter.setBasePath(basePath)

  await fastify.register(serverAdapter.registerPlugin(), {
    prefix: basePath,
  })

  await scheduleUpdates(fastify, bullBoard, resolvedRedis, pluginOptions)
}

export const bullBoard = fp<BullBoardOptions>(plugin, {
  fastify: '>=4.0.0',
  name: 'bull-board',
})
