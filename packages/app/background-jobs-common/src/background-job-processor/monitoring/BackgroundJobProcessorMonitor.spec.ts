import {
  type MockInstance,
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import type Redis from 'ioredis'
import pino from 'pino'
import { DependencyMocks } from '../../../test/dependencyMocks'
import { QUEUE_IDS_KEY } from '../constants'
import type { BackgroundJobProcessorDependencies } from '../processors/types'
import type { BaseJobPayload, RequestContext, SafeJob } from '../types'
import { BackgroundJobProcessorMonitor } from './BackgroundJobProcessorMonitor'
import { backgroundJobProcessorGetActiveQueueIds } from './backgroundJobProcessorGetActiveQueueIds'
import symbols = pino.symbols
import { generateMonotonicUuid } from '@lokalise/id-utils'

describe('BackgroundJobProcessorMonitor', () => {
  let mocks: DependencyMocks
  let deps: BackgroundJobProcessorDependencies<any>
  let redis: Redis

  beforeAll(() => {
    mocks = new DependencyMocks()
    deps = mocks.create()
    redis = mocks.startRedis()
  })

  beforeEach(async () => {
    await redis?.flushall('SYNC')
  })

  afterAll(async () => {
    redis.disconnect()
    await mocks.dispose()
  })

  describe('registerQueue', () => {
    it('throws an error if we try to register same queue twice', async () => {
      const queueId = 'test-queue'
      const monitor1 = new BackgroundJobProcessorMonitor(
        deps,
        {
          queueId,
          ownerName: 'test-owner',
          redisConfig: mocks.getRedisConfig(),
        },
        'registerQueue tests',
      )

      await monitor1.registerQueue()
      await expect(
        new BackgroundJobProcessorMonitor(
          deps,
          {
            queueId,
            ownerName: 'test-owner',
            redisConfig: mocks.getRedisConfig(),
          },
          'registerQueue tests',
        ).registerQueue(),
      ).rejects.toThrow(/Queue id "test-queue" is not unique/)

      await monitor1.unregisterQueue()
    })

    it('queue id is stored/updated on redis with current timestamp', async () => {
      const monitor = new BackgroundJobProcessorMonitor(
        deps,
        {
          queueId: 'test-queue',
          ownerName: 'test-owner',
          redisConfig: mocks.getRedisConfig(),
        },
        'registerQueue tests',
      )
      await monitor.registerQueue()

      const today = new Date()
      const [, score] = await redis.zrange(QUEUE_IDS_KEY, 0, -1, 'WITHSCORES')
      const queueIds = await backgroundJobProcessorGetActiveQueueIds(mocks.getRedisConfig())
      expect(queueIds).toStrictEqual(['test-queue'])

      // Comparing timestamps in seconds
      const todaySeconds = Math.floor(today.getTime() / 1000)
      const scoreSeconds = Math.floor(new Date(Number.parseInt(score)).getTime() / 1000)
      // max difference 1 to handle edge case of 0.1 - 1.0
      expect(scoreSeconds - todaySeconds).lessThanOrEqual(1)

      // unregistering to avoid error (see prev test)
      monitor.unregisterQueue()
      await monitor.registerQueue()

      const [, scoreAfterRestart] = await redis.zrange(QUEUE_IDS_KEY, 0, -1, 'WITHSCORES')
      const queueIdsAfterRestart = await backgroundJobProcessorGetActiveQueueIds(
        mocks.getRedisConfig(),
      )
      expect(queueIdsAfterRestart).toStrictEqual(['test-queue'])
      expect(new Date(Number.parseInt(score))).not.toEqual(
        new Date(Number.parseInt(scoreAfterRestart)),
      )

      monitor.unregisterQueue()
    })
  })

  describe('unregisterQueue', () => {
    it('unregister remove in memory queue id but no on redis', async () => {
      const monitor = new BackgroundJobProcessorMonitor(
        deps,
        {
          queueId: 'test-queue',
          ownerName: 'test-owner',
          redisConfig: mocks.getRedisConfig(),
        },
        'registerQueue tests',
      )

      await monitor.registerQueue()
      monitor.unregisterQueue()
      await monitor.registerQueue() // no error on register after unregister
      monitor.unregisterQueue()

      const queueIdsAfterUnregister = await backgroundJobProcessorGetActiveQueueIds(
        mocks.getRedisConfig(),
      )
      expect(queueIdsAfterUnregister).toStrictEqual(['test-queue'])
    })
  })

  describe('getRequestContext', () => {
    let monitor: BackgroundJobProcessorMonitor

    beforeAll(() => {
      monitor = new BackgroundJobProcessorMonitor(
        deps,
        {
          queueId: 'test-queue-getRequestContext',
          ownerName: 'test-owner',
          redisConfig: mocks.getRedisConfig(),
        },
        'BackgroundJobProcessorMonitor tests',
      )
    })

    it('request context not in job so a new one is generated', () => {
      const job = createFakeJob('test-correlation-id')
      const requestContext = monitor.getRequestContext(job)
      expect(requestContext.reqId).toEqual(job.id)
      expect(requestContext.logger).toBeDefined()

      // @ts-ignore

      const pinoLogger = requestContext.logger?.logger
      // @ts-ignore
      const loggerProps = pinoLogger?.[symbols.chindingsSym]
      expect(loggerProps).toContain(`"x-request-id":"${job.data.metadata.correlationId}"`)
      expect(loggerProps).toContain(`"jobId":"${job.id}"`)
      expect(loggerProps).toContain('"jobName":"name_test-correlation-id_job"')
    })

    it('request context exists so it is not recreated', () => {
      const job = createFakeJob('test-correlation-id')
      // @ts-ignore
      job.requestContext = {
        reqId: 'test-req-id',
        logger: { hello: 'world' } as any,
      }

      const requestContext = monitor.getRequestContext(job)
      expect(requestContext.reqId).toEqual('test-req-id')
      expect(requestContext.logger).toEqual({ hello: 'world' })
    })
  })

  describe('jobStarted', () => {
    let monitor: BackgroundJobProcessorMonitor
    let transactionManagerSpy: MockInstance
    let job: SafeJob<BaseJobPayload>

    beforeAll(() => {
      monitor = new BackgroundJobProcessorMonitor(
        deps,
        {
          queueId: 'test-queue-logJobStarted',
          ownerName: 'test-owner',
          redisConfig: mocks.getRedisConfig(),
        },
        'BackgroundJobProcessorMonitor tests',
      )
      job = createFakeJob('test-correlation-id')
    })

    beforeEach(() => {
      transactionManagerSpy = vi.spyOn(deps.transactionObservabilityManager, 'start')
    })

    it('should start transaction and log', () => {
      const requestContext = {
        reqId: 'test-req-id',
        logger: { info: (_obj: unknown, _msg: unknown) => undefined },
      } as RequestContext
      const loggerSpy = vi.spyOn(requestContext.logger, 'info')

      monitor.jobStart(job, requestContext)

      expect(transactionManagerSpy).toHaveBeenCalledWith(
        'bg_job:test-owner:test-queue-logJobStarted',
        job.id,
      )
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          origin: 'BackgroundJobProcessorMonitor tests',
        }),
        'Started job name_test-correlation-id_job',
      )
    })
  })

  describe('jobAttemptError', () => {
    let monitor: BackgroundJobProcessorMonitor

    beforeAll(() => {
      monitor = new BackgroundJobProcessorMonitor(
        deps,
        {
          queueId: 'test-queue-logJobTryError',
          ownerName: 'test-owner',
          redisConfig: mocks.getRedisConfig(),
        },
        'BackgroundJobProcessorMonitor tests',
      )
    })

    it('should log error', () => {
      const job = createFakeJob('test-correlation-id', 30)
      const requestContext = {
        reqId: 'test-req-id',
        logger: { error: (_obj: unknown, _msg: unknown) => undefined },
      } as RequestContext
      const loggerSpy = vi.spyOn(requestContext.logger, 'error')

      monitor.jobAttemptError(job, new Error('my-error'), requestContext)

      expect(loggerSpy).toHaveBeenCalledOnce()
      expect(loggerSpy.mock.calls[0]).toMatchObject([
        expect.objectContaining({
          jobProgress: 30,
          origin: 'BackgroundJobProcessorMonitor tests',
          error: expect.objectContaining({
            message: 'my-error',
            type: 'Error',
          }),
        }),
        'name_test-correlation-id_job try failed',
      ])
    })
  })

  describe('jobEnd', () => {
    let monitor: BackgroundJobProcessorMonitor
    let transactionManagerSpy: MockInstance

    beforeAll(() => {
      monitor = new BackgroundJobProcessorMonitor(
        deps,
        {
          queueId: 'test-queue-logJobStarted',
          ownerName: 'test-owner',
          redisConfig: mocks.getRedisConfig(),
        },
        'BackgroundJobProcessorMonitor tests',
      )
    })

    beforeEach(() => {
      transactionManagerSpy = vi.spyOn(deps.transactionObservabilityManager, 'stop')
    })

    it.each([[undefined], [0], [50], [100]])(
      'should stop transaction and log result - %s',
      (progress) => {
        const job = createFakeJob('test-correlation-id', progress)

        const requestContext = {
          reqId: 'test-req-id',
          logger: { info: (_obj: unknown, _msg: unknown) => undefined },
        } as RequestContext
        const loggerSpy = vi.spyOn(requestContext.logger, 'info')

        monitor.jobEnd(job, requestContext)

        expect(transactionManagerSpy).toHaveBeenCalledWith(job.id)
        expect(loggerSpy).toHaveBeenCalledWith(
          {
            origin: 'BackgroundJobProcessorMonitor tests',
            isSuccess: progress === 100,
            jobProgress: progress,
          },
          'Finished job name_test-correlation-id_job',
        )
      },
    )
  })
})

const createFakeJob = (correlationId: string, progress?: number, id?: string) =>
  ({
    id: id ?? generateMonotonicUuid(),
    name: `name_${correlationId}_job`,
    data: { metadata: { correlationId } },
    progress,
    log: (_: string) => Promise.resolve(undefined),
  }) as unknown as SafeJob<BaseJobPayload>
