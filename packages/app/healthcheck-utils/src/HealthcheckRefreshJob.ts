import {
  AbstractPeriodicJob,
  type JobExecutionContext,
  type PeriodicJobDependencies,
} from '@lokalise/background-jobs-common'
import { PromisePool } from '@supercharge/promise-pool'
import type { Healthcheck } from './healthchecks.js'

export type HealthcheckRefreshJobConfig = {
  intervalInMs?: number
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
        intervalInMs: config?.intervalInMs ?? 15000,
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
        await healthcheck.execute()
      })
  }
}
