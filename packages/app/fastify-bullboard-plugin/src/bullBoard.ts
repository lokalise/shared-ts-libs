import { constants as httpConstants } from 'node:http2'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import type { QueueProLike } from '@bull-board/api/bullMQProAdapter'
import { BullMQProAdapter } from '@bull-board/api/bullMQProAdapter'
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

export type BullBoardRedisConfig = RedisConfig & {
  /**
   * If true, queues discovered on this Redis connection are instantiated with
   * `queueProConstructor` and wrapped in `BullMQProAdapter`, enabling
   * group-aware counts and listings in the dashboard. Defaults to false.
   */
  isPro?: boolean
}

export type BullBoardOptions = {
  /**
   * Constructor for non-Pro BullMQ queues. Required if any entry of `redisConfigs`
   * does not have `isPro: true`.
   */
  queueConstructor?: QueueConstructor
  /**
   * Constructor for BullMQ Pro queues (e.g. `QueuePro` from `@taskforcesh/bullmq-pro`).
   * Required if any entry of `redisConfigs` has `isPro: true`.
   */
  queueProConstructor?: QueueProConstructor
  basePath: string
  assetsPath?: string
  refreshIntervalInSeconds?: number
  redisConfigs: BullBoardRedisConfig[]
}

export interface QueueProConstructor {
  new (name: string, opts?: Record<string, unknown>): QueueProLike
}

export interface QueueConstructor {
  new (name: string, opts?: QueueOptions, Connection?: typeof RedisConnection): Queue
}

type ResolvedRedis = {
  redis: Redis
  sanitizedConfig: RedisConfig
  prefix: string | undefined
  isPro: boolean
}

let currentQueues: Queue[] = []

const containStatusCode = (error: Error): error is Error & { statusCode: number } => {
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

const validateConstructors = (pluginOptions: BullBoardOptions) => {
  const hasPro = pluginOptions.redisConfigs.some((c) => c.isPro)
  const hasNonPro = pluginOptions.redisConfigs.some((c) => !c.isPro)

  if (hasPro && !pluginOptions.queueProConstructor) {
    throw new Error(
      'bull-board: queueProConstructor is required when redisConfigs contains entries with isPro: true',
    )
  }
  if (hasNonPro && !pluginOptions.queueConstructor) {
    throw new Error(
      'bull-board: queueConstructor is required when redisConfigs contains entries without isPro: true',
    )
  }
}

const buildQueueForConfig = (
  id: string,
  resolved: ResolvedRedis,
  pluginOptions: BullBoardOptions,
): { queue: Queue; adapter: BullMQAdapter } => {
  const opts = { connection: resolved.sanitizedConfig, prefix: resolved.prefix }

  if (resolved.isPro) {
    // biome-ignore lint/style/noNonNullAssertion: validated by validateConstructors
    const queue = new pluginOptions.queueProConstructor!(id, opts)
    return {
      queue: queue as unknown as Queue,
      adapter: new BullMQProAdapter(queue, { delimiter: QUEUE_GROUP_DELIMITER }),
    }
  }

  // biome-ignore lint/style/noNonNullAssertion: validated by validateConstructors
  const queue = new pluginOptions.queueConstructor!(id, opts)
  return { queue, adapter: new BullMQAdapter(queue, { delimiter: QUEUE_GROUP_DELIMITER }) }
}

const getCurrentQueues = async (
  resolvedRedis: ResolvedRedis[],
  pluginOptions: BullBoardOptions,
) => {
  const queueIds = await Promise.all(
    resolvedRedis.map((e) => backgroundJobProcessorGetActiveQueueIds(e.redis)),
  )

  const queues: Queue[] = []
  const queuesAdapter: BullMQAdapter[] = []
  queueIds.forEach((ids, index) => {
    // biome-ignore lint/style/noNonNullAssertion: Should exist
    const resolved = resolvedRedis[index]!
    for (const id of ids) {
      const { queue, adapter } = buildQueueForConfig(id, resolved, pluginOptions)
      queues.push(queue)
      queuesAdapter.push(adapter)
    }
  })

  return { queues, queuesAdapter }
}

const replaceQueues = async (
  fastify: FastifyInstance,
  bullBoard: ReturnType<typeof createBullBoard>,
  resolvedRedis: ResolvedRedis[],
  pluginOptions: BullBoardOptions,
) => {
  const { refreshIntervalInSeconds } = pluginOptions

  fastify.log.debug({ refreshIntervalInSeconds }, 'Bull-dashboard -> updating queues')
  const { queues: newQueues, queuesAdapter } = await getCurrentQueues(resolvedRedis, pluginOptions)
  bullBoard.replaceQueues(queuesAdapter)
  await Promise.all(currentQueues.map((queue) => queue.close()))
  currentQueues = newQueues
}

const scheduleUpdates = async (
  fastify: FastifyInstance,
  bullBoard: ReturnType<typeof createBullBoard>,
  resolvedRedis: ResolvedRedis[],
  pluginOptions: BullBoardOptions,
) => {
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
    redis: new Redis(config),
    sanitizedConfig: sanitizeRedisConfig(config),
    prefix: config.keyPrefix,
    isPro: config.isPro === true,
  }))

const plugin = async (fastify: FastifyInstance, pluginOptions: BullBoardOptions) => {
  validateConstructors(pluginOptions)

  const { basePath, assetsPath } = pluginOptions
  const resolvedRedis = resolveRedis(pluginOptions)

  const { queues, queuesAdapter } = await getCurrentQueues(resolvedRedis, pluginOptions)
  currentQueues = queues

  const serverAdapter = new FastifyAdapter()
  const bullBoard = createBullBoard({
    queues: queuesAdapter,
    serverAdapter,
  })

  // biome-ignore lint/suspicious/noExplicitAny: bull-board is not exporting this type
  serverAdapter.setErrorHandler(bullBoardErrorHandler as any)
  serverAdapter.setBasePath(assetsPath ?? basePath)

  await fastify.register(serverAdapter.registerPlugin(), {
    prefix: basePath,
  })

  await scheduleUpdates(fastify, bullBoard, resolvedRedis, pluginOptions)

  // Cleanup connections on shutdown
  fastify.addHook('onClose', async () => {
    await Promise.allSettled([
      ...currentQueues.map((queue) => queue.close()),
      ...resolvedRedis.map((r) => r.redis.quit()),
    ])
  })
}

export const bullBoard = fp<BullBoardOptions>(plugin, {
  fastify: '>=4.0.0',
  name: 'bull-board',
})
