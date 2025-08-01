import {
  AbstractPeriodicJob,
  type JobExecutionContext,
  type PeriodicJobDependencies,
} from '@lokalise/background-jobs-common'
import { PromisePool } from '@supercharge/promise-pool'
import type { Healthcheck } from './healthchecks.ts'

export type HealthcheckRefreshJobConfig = {
  intervalInMs?: number
  shouldLogExecution?: boolean // default is off
}

export class HealthcheckRefreshJob extends AbstractPeriodicJob {
  public static JOB_NAME = 'HealthcheckRefreshJob'
  private readonly healthCheckers: readonly Healthcheck[]

  constructor(
    dependencies: PeriodicJobDependencies,
    healthchecks: readonly Healthcheck[],
    config?: HealthcheckRefreshJobConfig,
  ) {
    super(
      {
        jobId: HealthcheckRefreshJob.JOB_NAME,
        schedule: {
          intervalInMs: config?.intervalInMs ?? 15000,
        },
        shouldLogExecution: config?.shouldLogExecution ?? false,
        singleConsumerMode: {
          enabled: false,
        },
      },
      dependencies,
    )

    this.healthCheckers = healthchecks
  }

  protected processInternal(_executionUuid: JobExecutionContext): Promise<unknown> {
    return PromisePool.withConcurrency(2)
      .for(this.healthCheckers)
      .process(async (healthcheck) => {
        if (this.options.shouldLogExecution) {
          this.logger.info(`Starting healthcheck ${healthcheck.getId()} execution`)
        }

        const result = await healthcheck.execute()
        if (this.options.shouldLogExecution && !result.error) {
          this.logger.info(`Healthcheck ${healthcheck.getId()} executed successfully`)
        }
      })
  }
}
