import { PromisePool } from '@supercharge/promise-pool'
import { AbstractPeriodicJob, type PeriodicJobDependencies } from './AbstractPeriodicJob'
import type { Healthcheck } from './healthchecks.js'

export class HealthcheckRefreshJob extends AbstractPeriodicJob {
  public static JOB_NAME = 'HealthcheckRefreshJob'
  private readonly healthCheckers: readonly Healthcheck[]

  constructor(dependencies: PeriodicJobDependencies, healthchecks: readonly Healthcheck[]) {
    super(
      {
        jobId: HealthcheckRefreshJob.JOB_NAME,
        intervalInMs: 15000,
        singleConsumerMode: {
          enabled: false,
        },
      },
      dependencies,
    )

    this.healthCheckers = healthchecks
  }

  protected processInternal(_executionUuid: string): Promise<unknown> {
    return PromisePool.withConcurrency(2)
      .for(this.healthCheckers)
      .process(async (healthcheck) => {
        await healthcheck.execute()
      })
  }
}
