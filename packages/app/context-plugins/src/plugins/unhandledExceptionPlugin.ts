import { requestContext } from '@fastify/request-context'
import type { ErrorReporter } from '@lokalise/node-core'
import { InternalError, isError } from '@lokalise/node-core'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { stdSerializers } from 'pino'

import { REQUEST_ID_STORE_KEY } from './requestContextProviderPlugin'

export const commonErrorObjectResolver: ErrorObjectResolver = (
	err: unknown,
	correlationId?: string,
): unknown => {
	return {
		...stdSerializers.err(err as Error),
		'x-request-id': correlationId,
	}
}

export type ErrorObjectResolver = (err: unknown, correlationId?: string) => unknown

export interface UnhandledExceptionPluginOptions {
	errorObjectResolver: ErrorObjectResolver
	errorReporter: ErrorReporter
	shutdownAfterHandling: boolean
}

function handler(app: FastifyInstance, opts: UnhandledExceptionPluginOptions, err: Error): void {
	const reqId = requestContext.get(REQUEST_ID_STORE_KEY)
	const logObject = opts.errorObjectResolver(err, reqId)
	app.log.fatal(logObject, 'uncaught exception detected')
	opts.errorReporter.report({
		error: err,
		context: {
			'x-request-id': reqId,
		},
	})

	if (opts.shutdownAfterHandling) {
		// shutdown the server gracefully
		app.close(() => {
			process.exit(1) // then exit
		})
	}
}

function plugin(app: FastifyInstance, opts: UnhandledExceptionPluginOptions, done: () => void) {
	// Handle unhandled exceptions
	process.on('unhandledRejection', (err) => {
		const error = isError(err)
			? err
			: new InternalError({
					errorCode: 'UNHANDLED_REJECTION',
					message: 'Unhandled rejection',
					details: {
						errorObject: JSON.stringify(err),
					},
				})
		handler(app, opts, error)
	})
	process.on('uncaughtException', (err) => handler(app, opts, err))
	done()
}

export const unhandledExceptionPlugin = fp(plugin, {
	fastify: '4.x',
	name: 'unhandled-exception-plugin',
})
