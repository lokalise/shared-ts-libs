import { constants as httpConstants } from 'node:http2'

import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js'
import type { ControllerHandlerReturnType } from '@bull-board/api/dist/typings/app'
import { FastifyAdapter } from '@bull-board/fastify'
import fastifySchedule from '@fastify/schedule'
import { backgroundJobProcessorGetActiveQueueIds } from '@lokalise/background-jobs-common'
import { QueuePro } from '@lokalise/bullmq-pro'
import { resolveGlobalErrorLogObject } from '@lokalise/node-core'
import type { Queue } from 'bullmq'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import type Redis from 'ioredis'
import { AsyncTask, SimpleIntervalJob } from 'toad-scheduler'

export type BullBoardOptions = {
	redisInstances: Redis[]
	basePath: string
	refreshIntervalInSeconds?: number
}

const containStatusCode = (error: Error): error is Error & { statusCode: number } =>
	Object.hasOwn(error, 'statusCode')

const bullBoardErrorHandler = (error: Error): ControllerHandlerReturnType => {
	const status = containStatusCode(error)
		? error.statusCode
		: httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR
	return {
		status: status as ControllerHandlerReturnType['status'],
		body: { message: error.message, details: error.stack },
	}
}

const getCurrentQueues = async (redisInstances: Redis[]): Promise<BullMQAdapter[]> => {
	const queueIds = await Promise.all(
		redisInstances.map((redis) => backgroundJobProcessorGetActiveQueueIds(redis)),
	)

	return queueIds
		.flatMap((ids, index) =>
			ids.map((id) => new QueuePro(id, { connection: redisInstances[index] })),
		)
		.map((queue) => new BullMQAdapter(queue as unknown as Queue))
}

const schedulesUpdates = async (
	fastify: FastifyInstance,
	bullBoard: ReturnType<typeof createBullBoard>,
	pluginOptions: BullBoardOptions,
) => {
	const { refreshIntervalInSeconds, redisInstances } = pluginOptions

	if (!refreshIntervalInSeconds || refreshIntervalInSeconds <= 0) return

	const refreshTask = new AsyncTask(
		'Bull-board - update queues',
		async () => {
			fastify.log.debug({ refreshIntervalInSeconds }, 'Bull-dashboard -> updating queues')
			bullBoard.replaceQueues(await getCurrentQueues(redisInstances))
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
	const { basePath, redisInstances } = pluginOptions

	const serverAdapter = new FastifyAdapter()
	const bullBoard = createBullBoard({
		queues: await getCurrentQueues(redisInstances),
		serverAdapter,
	})
	serverAdapter.setErrorHandler(bullBoardErrorHandler)
	serverAdapter.setBasePath(basePath)

	await fastify.register(serverAdapter.registerPlugin(), {
		basePath,
		prefix: basePath,
	})

	await schedulesUpdates(fastify, bullBoard, pluginOptions)
}

export const bullBoard = fp<BullBoardOptions>(plugin, {
	fastify: '>=4.0.0',
	name: 'bull-board',
})
