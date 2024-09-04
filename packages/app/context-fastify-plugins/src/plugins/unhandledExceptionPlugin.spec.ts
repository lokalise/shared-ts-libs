import type { ErrorReport } from '@lokalise/error-utils'
import { isInternalError } from '@lokalise/node-core'
import fastify from 'fastify'
import type { RouteHandlerMethod } from 'fastify/types/route'

import {
  getRequestIdFastifyAppConfig,
  requestContextProviderPlugin,
} from './requestContextProviderPlugin'
import { unhandledExceptionPlugin } from './unhandledExceptionPlugin'

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error)
  // Optionally throw an error here to fail the test
})

async function initApp(routeHandler: RouteHandlerMethod, errors: ErrorReport[]) {
  const app = fastify({
    ...getRequestIdFastifyAppConfig(),
  })
  await app.register(requestContextProviderPlugin)
  await app.register(unhandledExceptionPlugin, {
    shutdownAfterHandling: false,
    errorObjectResolver: (err) => err,
    errorReporter: {
      report: (err) => {
        errors.push(err)
      },
    },
  })

  app.route({
    method: 'GET',
    url: '/',
    handler: routeHandler,
  })
  await app.ready()

  return app
}

describe('unhandledExceptionPlugin', () => {
  it('handled unhandled rejection with Error type', async () => {
    const errors: ErrorReport[] = []
    const app = await initApp((_req, res) => {
      void new Promise(() => {
        throw new Error('new test unhandled error')
      })
      return res.status(204).send()
    }, errors)
    const response = await app.inject().get('/').end()
    expect(response.statusCode).toBe(204)

    await vi.waitUntil(
      () => {
        return errors.length > 0
      },
      {
        interval: 50,
        timeout: 2000,
      },
    )

    expect(errors).toHaveLength(1)
    const error = errors[0]
    expect(error.error.message).toBe('new test unhandled error')
  })

  it('handled unhandled rejection with not error type', async () => {
    const errors: ErrorReport[] = []
    const app = await initApp((_req, res) => {
      void new Promise(() => {
        throw 'this is my test unhandled error'
      })
      return res.status(204).send()
    }, errors)
    const response = await app.inject().get('/').end()
    expect(response.statusCode).toBe(204)

    await vi.waitUntil(
      () => {
        return errors.length > 0
      },
      {
        interval: 50,
        timeout: 2000,
      },
    )

    expect(errors).toHaveLength(1)
    const error = errors[0]
    expect(isInternalError(error.error)).toBe(true)
    expect(error.error).toMatchObject({
      errorCode: 'UNHANDLED_REJECTION',
      message: 'Unhandled rejection',
      details: { errorObject: '"this is my test unhandled error"' },
    })
  })
})
