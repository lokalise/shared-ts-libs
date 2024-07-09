import type { FastifyInstance } from 'fastify'
import fastify from 'fastify'
import type { RouteHandlerMethod } from 'fastify/types/route'

import {
	getRequestIdFastifyAppConfig,
	requestContextProviderPlugin,
} from './requestContextProviderPlugin'

declare module 'fastify' {
	interface RequestContext {
		jwtToken?: string
		requestingUserId?: string
	}
}

async function initApp(routeHandler: RouteHandlerMethod) {
	const app = fastify(getRequestIdFastifyAppConfig())
	await app.register(requestContextProviderPlugin)

	app.route({
		method: 'GET',
		url: '/',
		handler: routeHandler,
	})
	await app.ready()
	return app
}

describe('requestContextProviderPlugin custom request context', () => {
	let app: FastifyInstance
	afterAll(async () => {
		await app.close()
	})

	it('sets custom context field correctly', async () => {
		expect.assertions(1)

		app = await initApp((req, res) => {
			req.reqContext.jwtToken = 'dummy token'
			req.reqContext.reqId = 'someReqId'
			return res.status(204).send()
		})

		const response = await app.inject().get('/').end()
		expect(response.statusCode).toBe(204)
	})
})
