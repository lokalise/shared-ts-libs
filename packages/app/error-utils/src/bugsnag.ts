import type { Event, NotifiableError } from '@bugsnag/js'
import Bugsnag from '@bugsnag/js'
import type { NodeConfig } from '@bugsnag/node'
import type { ErrorReporter } from '@lokalise/node-core'
import { isInternalError, isPublicNonRecoverableError } from '@lokalise/node-core'

export type Severity = Event['severity']

export interface ErrorReport {
	error: NotifiableError
	severity?: Severity
	unhandled?: boolean
	context?: Record<string, unknown>
}

export const reportErrorToBugsnag = ({
	error,
	severity = 'error',
	unhandled = true,
	context,
}: ErrorReport) =>
	Bugsnag.isStarted() &&
	Bugsnag.notify(error, (event) => {
		let computedContext = { ...(context ?? {}) }
		if (isPublicNonRecoverableError(error) || isInternalError(error)) {
			computedContext = {
				...computedContext,
				errorDetails: error.details,
				errorCode: error.errorCode,
			}
		}

		event.addMetadata('Context', computedContext)
		event.severity = severity
		event.unhandled = unhandled
	})

export const startBugsnag = (config: NodeConfig) => {
	if (!Bugsnag.isStarted()) {
		Bugsnag.start(config)
	}
}

export const addFeatureFlag = (name: string, variant: string | null) => {
	Bugsnag.addFeatureFlag(name, variant)
}

export const bugsnagErrorReporter: ErrorReporter = {
	report: (report) => reportErrorToBugsnag(report),
}
