import { type CommonLogger, type ErrorReporter, globalLogger } from '@lokalise/node-core'
import {
  AbstractPeriodicJob,
  type BackgroundJobConfiguration,
  type JobExecutionContext,
  type PeriodicJobDependencies,
} from '../../src.js'

export type FakePeriodicJobDependencies = Omit<
  PeriodicJobDependencies,
  'transactionObservabilityManager' | 'logger' | 'errorReporter'
> & {
  logger?: CommonLogger
  errorReporter?: ErrorReporter
}

export class FakePeriodicJob extends AbstractPeriodicJob {
  private readonly processFn: (executionContext: JobExecutionContext) => Promise<void>

  constructor(
    processFn: (executionContext: JobExecutionContext) => Promise<void>,
    dependencies: FakePeriodicJobDependencies,
    options?: Omit<BackgroundJobConfiguration, 'jobId'>,
  ) {
    super(
      {
        jobId: FakePeriodicJob.name,
        schedule: {
          intervalInMs: 50,
        },
        ...options,
      },
      {
        logger: globalLogger,
        errorReporter: {
          report: () => {},
        },
        transactionObservabilityManager: {
          start: () => {},
          startWithGroup: () => {},
          stop: () => {},
          addCustomAttributes: () => {},
        },
        ...dependencies,
      },
    )
    this.processFn = processFn
  }

  protected async processInternal(context: JobExecutionContext): Promise<void> {
    await this.processFn(context)
  }
}
