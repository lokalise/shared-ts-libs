import Bugsnag, { type Event, type NodeConfig, type NotifiableError } from '@bugsnag/node'
import type { ErrorReporter } from '@lokalise/node-core'
import { errWithCause } from 'pino-std-serializers'

const BugsnagClient = Bugsnag.default

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
  BugsnagClient.isStarted() &&
  BugsnagClient.notify(error, (event) => {
    const computedContext = {
      ...(context ?? {}),
      ...(Error.isError(error) ? { err: errWithCause(error) } : {}),
    }

    event.addMetadata('Context', computedContext)
    event.severity = severity
    event.unhandled = unhandled
  })

export const startBugsnag = (config: NodeConfig) => {
  if (!BugsnagClient.isStarted()) {
    BugsnagClient.start(config)
  }
}

export const addFeatureFlag = (name: string, variant: string | null) => {
  BugsnagClient.addFeatureFlag(name, variant)
}

export const bugsnagErrorReporter: ErrorReporter = {
  report: (report) => reportErrorToBugsnag(report),
}
