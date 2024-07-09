import type { ErrorReport } from '@lokalise/error-utils'
import fastify from 'fastify'
import type { RouteHandlerMethod } from 'fastify/types/route'
import { beforeEach } from 'vitest'

import {
	getRequestIdFastifyAppConfig,
	requestContextProviderPlugin,
} from './requestContextProviderPlugin'
import { unhandledExceptionPlugin } from './unhandledExceptionPlugin'

const errors: ErrorReport[] = []

process.on('unhandledRejection', (error) => {
	console.error('Unhandled Rejection:', error)
	// Optionally throw an error here to fail the test
})

async function initApp(routeHandler: RouteHandlerMethod) {
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

// This needs to be skipped in CI, because vitest fails the run if there are any unhandled errors. See https://github.com/vitest-dev/vitest/issues/5796
describe.skip('unhandledExceptionPlugin', () => {
	beforeEach(() => {
		errors.splice(0, errors.length)
	})

	it('handled unhandled rejection', async () => {
		const app = await initApp((req, res) => {
			void new Promise(() => {
				throw new Error('new unhandled error')
			})
			return res.status(204).send()
		})
		const response = await app.inject().get('/').end()
		expect(response.statusCode).toBe(204)

		const errorsReported = await vitest.waitUntil(
			() => {
				return errors.length > 0
			},
			{
				interval: 50,
				timeout: 2000,
			},
		)

		expect(errorsReported).toBe(true)
	})
})
