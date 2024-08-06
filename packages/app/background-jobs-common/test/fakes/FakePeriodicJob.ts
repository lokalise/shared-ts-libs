import { type CommonLogger, type ErrorReporter, globalLogger } from '@lokalise/node-core'
import {
  AbstractPeriodicJob,
  type BackgroundJobConfiguration,
  type PeriodicJobDependencies,
} from '../../src'

export type FakePeriodicJobDependencies = Omit<
  PeriodicJobDependencies,
  'transactionObservabilityManager' | 'logger' | 'errorReporter'
> & {
  logger?: CommonLogger
  errorReporter?: ErrorReporter
}

export class FakePeriodicJob extends AbstractPeriodicJob {
  private readonly processFn: (executionId: string) => Promise<void>

  constructor(
    processFn: (executionId: string) => Promise<void>,
    dependencies: FakePeriodicJobDependencies,
    options?: Omit<BackgroundJobConfiguration, 'jobId'>,
  ) {
    super(
      {
        jobId: FakePeriodicJob.name,
        intervalInMs: 50,
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
        },
        ...dependencies,
      },
    )
    this.processFn = processFn
  }

  protected async processInternal(executionUuid: string): Promise<void> {
    await this.processFn(executionUuid)
  }
}
