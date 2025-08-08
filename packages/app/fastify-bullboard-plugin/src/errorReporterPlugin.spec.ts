import { type ErrorReporter, InternalError, PublicNonRecoverableError } from '@lokalise/node-core'
import fastify, { type FastifyInstance, type RouteHandlerMethod } from 'fastify'
import pino from 'pino'
import { afterAll, describe, expect, it, type MockInstance, vi } from 'vitest'

import { FakeErrorReporter } from '../test/FakeErrorReporter.js'
import { errorReporterPlugin } from './errorReporterPlugin.js'

async function initApp(routeHandler: RouteHandlerMethod, errorReporter: ErrorReporter) {
  const app = fastify({
    logger: true,
  })
  await app.register(errorReporterPlugin, { errorReporter })

  app.route({
    method: 'GET',
    url: '/',
    handler: routeHandler,
  })

  await app.ready()
  return app
}

describe('errorHandlerPlugin', () => {
  let app: FastifyInstance

  afterAll(async () => {
    await app.close()
  })

  const performRequest = async () => app.inject().get('/').end()

  it('generic errors are reported', async () => {
    const fakeErrorReporter = new FakeErrorReporter()
    const error = new Error('Generic error')
    let logSpy: MockInstance | undefined
    app = await initApp((req) => {
      logSpy = vi.spyOn(req.log, 'error')
      throw error
    }, fakeErrorReporter)

    await performRequest()

    expect(fakeErrorReporter.calls).length(1)
    expect(fakeErrorReporter.calls[0]).toEqual({ error })
    expect(logSpy).toHaveBeenCalledWith({
      message: error.message,
      error: pino.stdSerializers.err({
        name: error.name,
        message: error.message,
        stack: error.stack,
      }),
    })
  })

  it('internal errors are reported', async () => {
    const fakeErrorReporter = new FakeErrorReporter()
    const error = new InternalError({
      message: 'Internal error',
      errorCode: 'INTERNAL_ERROR',
    })
    let logSpy: MockInstance | undefined
    app = await initApp((req) => {
      logSpy = vi.spyOn(req.log, 'error')
      throw error
    }, fakeErrorReporter)

    await performRequest()

    expect(fakeErrorReporter.calls).length(1)
    expect(fakeErrorReporter.calls[0]).toEqual({ error })
    expect(logSpy).toHaveBeenCalledWith({
      message: error.message,
      code: error.errorCode,
      details: error.details ? JSON.stringify(error.details) : undefined,
      error: pino.stdSerializers.err({
        name: error.name,
        message: error.message,
        stack: error.stack,
      }),
    })
  })

  it('5xx errors are reported', async () => {
    const fakeErrorReporter = new FakeErrorReporter()
    const error = new PublicNonRecoverableError({
      httpStatusCode: 500,
      message: 'Internal error',
      errorCode: 'INTERNAL_ERROR',
    })
    let logSpy: MockInstance | undefined
    app = await initApp((req) => {
      logSpy = vi.spyOn(req.log, 'error')
      throw error
    }, fakeErrorReporter)

    await performRequest()

    expect(fakeErrorReporter.calls).length(1)
    expect(fakeErrorReporter.calls[0]).toEqual({ error })
    expect(logSpy).toHaveBeenCalledWith({
      message: error.message,
      error: pino.stdSerializers.err({
        name: error.name,
        message: error.message,
        stack: error.stack,
      }),
    })
  })

  it('4xx erros are ignored', async () => {
    const fakeErrorReporter = new FakeErrorReporter()
    const error = new PublicNonRecoverableError({
      httpStatusCode: 400,
      message: 'test',
      errorCode: 'TEST',
    })
    app = await initApp(() => {
      throw error
    }, fakeErrorReporter)

    await performRequest()

    expect(fakeErrorReporter.calls).length(0)
  })
})
