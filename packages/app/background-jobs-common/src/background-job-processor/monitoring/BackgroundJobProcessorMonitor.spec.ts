import { generateMonotonicUuid } from '@lokalise/id-utils'
import pino from 'pino'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest'
import { TestDependencyFactory } from '../../../test/TestDependencyFactory.ts'
import type { BackgroundJobProcessorDependencies } from '../processors/types.ts'
import type { BaseJobPayload, RequestContext, SafeJob } from '../types.ts'
import { BackgroundJobProcessorMonitor } from './BackgroundJobProcessorMonitor.ts'
import { backgroundJobProcessorGetActiveQueueIds } from './backgroundJobProcessorGetActiveQueueIds.ts'

// @ts-expect-error
import symbols = pino.symbols

describe('BackgroundJobProcessorMonitor', () => {
  let factory: TestDependencyFactory
  let deps: BackgroundJobProcessorDependencies<any>

  beforeAll(() => {
    factory = new TestDependencyFactory()
    deps = factory.create()
  })

  beforeEach(async () => {
    await factory.clearRedis()
  })

  afterAll(async () => {
    await factory.dispose()
  })

  describe('registerQueue', () => {
    describe('old processor', () => {
      it('throws an error if we try to register same queue twice', async () => {
        const monitor = new BackgroundJobProcessorMonitor(deps, {
          isNewProcessor: false,
          queueId: 'test-queue',
          processorName: 'registerQueue tests',
          ownerName: 'test-owner',
          redisConfig: factory.getRedisConfig(),
        })

        await monitor.registerQueueProcessor()
        await expect(monitor.registerQueueProcessor()).rejects.toMatchInlineSnapshot(
          `[Error: Processor for queue id "test-queue" is not unique.]`,
        )

        await monitor.unregisterQueueProcessor()
      })

      it('queue id is stored/updated on redis with current timestamp', async () => {
        const monitor = new BackgroundJobProcessorMonitor(deps, {
          isNewProcessor: false,
          queueId: 'test-queue',
          processorName: 'registerQueue tests',
          ownerName: 'test-owner',
          redisConfig: factory.getRedisConfig(),
        })
        await monitor.registerQueueProcessor()

        const queueIds = await backgroundJobProcessorGetActiveQueueIds(factory.getRedisConfig())
        expect(queueIds).toStrictEqual(['test-queue'])

        monitor.unregisterQueueProcessor()
      })
    })

    describe('new processor', () => {
      it('throws an error if we try to register same queue twice', async () => {
        const monitor = new BackgroundJobProcessorMonitor(deps, {
          isNewProcessor: true,
          queueId: 'test-queue',
          processorName: 'registerQueue tests',
          ownerName: 'test-owner',
        })

        await monitor.registerQueueProcessor()
        await expect(monitor.registerQueueProcessor()).rejects.toMatchInlineSnapshot(
          `[Error: Processor for queue id "test-queue" is not unique.]`,
        )

        await monitor.unregisterQueueProcessor()
      })

      it('queue id should not be registered in redis', async () => {
        const monitor = new BackgroundJobProcessorMonitor(deps, {
          isNewProcessor: true,
          queueId: 'test-queue',
          processorName: 'registerQueue tests',
          ownerName: 'test-owner',
        })
        await monitor.registerQueueProcessor()

        const queueIds = await backgroundJobProcessorGetActiveQueueIds(factory.getRedisConfig())
        expect(queueIds).toStrictEqual([])

        monitor.unregisterQueueProcessor()
      })
    })
  })

  describe('unregisterQueue', () => {
    it('unregister remove in memory queue id but no on redis', async () => {
      const monitor = new BackgroundJobProcessorMonitor(deps, {
        isNewProcessor: false,
        queueId: 'test-queue',
        processorName: 'registerQueue tests',
        ownerName: 'test-owner',
        redisConfig: factory.getRedisConfig(),
      })

      await monitor.registerQueueProcessor()
      monitor.unregisterQueueProcessor()
      await monitor.registerQueueProcessor() // no error on register after unregister
      monitor.unregisterQueueProcessor()

      const queueIdsAfterUnregister = await backgroundJobProcessorGetActiveQueueIds(
        factory.getRedisConfig(),
      )
      expect(queueIdsAfterUnregister).toStrictEqual(['test-queue'])
    })
  })

  describe('getRequestContext', () => {
    let monitor: BackgroundJobProcessorMonitor

    beforeAll(() => {
      monitor = new BackgroundJobProcessorMonitor(deps, {
        isNewProcessor: false,
        queueId: 'test-queue',
        processorName: 'registerQueue tests',
        ownerName: 'test-owner',
        redisConfig: factory.getRedisConfig(),
      })
    })

    // FixMe replace with a custom test logger not to rely on pino internals
    it.skip('request context not in job so a new one is generated', () => {
      const correlationId = generateMonotonicUuid()
      const job = createFakeJob(correlationId)
      const requestContext = monitor.getRequestContext(job)
      expect(requestContext.reqId).toEqual(correlationId)
      expect(requestContext.logger).toBeDefined()

      // @ts-expect-error
      const pinoLogger = requestContext.logger?.logger
      const loggerProps = pinoLogger[symbols.chindingsSym]
      expect(loggerProps).toContain(`"x-request-id":"${job.data.metadata.correlationId}"`)
      expect(loggerProps).toContain(`"jobId":"${job.id}"`)
      expect(loggerProps).toContain(`"jobName":"name_${correlationId}_job"`)
    })

    it('request context exists so it is not recreated', () => {
      const job = createFakeJob('test-correlation-id')
      // @ts-expect-error
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
      monitor = new BackgroundJobProcessorMonitor(deps, {
        isNewProcessor: false,
        queueId: 'test-queue-logJobStarted',
        processorName: 'BackgroundJobProcessorMonitor tests',
        ownerName: 'test-owner',
        redisConfig: factory.getRedisConfig(),
      })
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
      monitor = new BackgroundJobProcessorMonitor(deps, {
        isNewProcessor: false,
        queueId: 'test-queue',
        processorName: 'BackgroundJobProcessorMonitor tests',
        ownerName: 'test-owner',
        redisConfig: factory.getRedisConfig(),
      })
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
      monitor = new BackgroundJobProcessorMonitor(deps, {
        isNewProcessor: false,
        queueId: 'test-queue',
        processorName: 'BackgroundJobProcessorMonitor tests',
        ownerName: 'test-owner',
        redisConfig: factory.getRedisConfig(),
      })
    })

    beforeEach(() => {
      transactionManagerSpy = vi.spyOn(deps.transactionObservabilityManager, 'stop')
    })

    it.each([
      [undefined],
      [0],
      [50],
      [100],
    ])('should stop transaction and log result - %s', (progress) => {
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
    })
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
