import { constants as httpConstants } from 'node:http2'

import type { ErrorReporter } from '@lokalise/node-core'
import {
	isError,
	isInternalError,
	isObject,
	isPublicNonRecoverableError,
} from '@lokalise/node-core'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { pino } from 'pino'

export type ErrorReporterOptions = {
	errorReporter: ErrorReporter
}

function resolveLogObject(error: unknown): Record<string, unknown> {
	if (isInternalError(error)) {
		return {
			message: error.message,
			code: error.errorCode,
			details: error.details ? JSON.stringify(error.details) : undefined,
			error: pino.stdSerializers.err({
				name: error.name,
				message: error.message,
				stack: error.stack,
			}),
		}
	}
	if (isError(error)) {
		return {
			message: error.message,
			error: pino.stdSerializers.err({
				name: error.name,
				message: error.message,
				stack: error.stack,
			}),
		}
	}

	return {
		message: isObject(error) ? error.message : JSON.stringify(error),
		error,
	}
}

function plugin(
	fastify: FastifyInstance,
	pluginOptions: ErrorReporterOptions,
	next: (err?: Error) => void,
) {
	fastify.addHook('onError', (request, _reply, error, done) => {
		let statusCode = error.statusCode ?? httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR
		if (isPublicNonRecoverableError(error)) {
			statusCode = error.httpStatusCode
		}

		if (statusCode >= httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR) {
			request.log.error(resolveLogObject(error))
			pluginOptions.errorReporter.report({ error })
		}

		done()
	})

	next()
}

export const errorReporterPlugin = fp<ErrorReporterOptions>(plugin, {
	fastify: '>=4.0.0',
	name: 'error-reporter',
})
