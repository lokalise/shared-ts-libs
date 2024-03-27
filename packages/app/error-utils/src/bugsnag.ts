import type { Event, NotifiableError } from '@bugsnag/js'
import Bugsnag from '@bugsnag/js'
import type { ErrorReporter } from '@lokalise/node-core'
import type { NodeConfig } from '@bugsnag/node'

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
		event.severity = severity
		event.unhandled = unhandled
		if (context) {
			event.addMetadata('Context', context)
		}
	})

export const startBugsnag = (config: NodeConfig) => Bugsnag.start(config)

export const bugsnagErrorReporter: ErrorReporter = {
	report: (report) => reportErrorToBugsnag(report),
}
