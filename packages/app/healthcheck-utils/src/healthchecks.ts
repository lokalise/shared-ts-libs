import type { Either } from '@lokalise/node-core'
import { Gauge } from 'prom-client'
import type { HealthcheckResultsStore } from './HealthcheckResultsStore.ts'

export type Healthcheck = {
  areMetricsEnabled: boolean

  instantiateMetrics: () => void
  execute: () => Promise<void>
  check: () => Promise<Either<Error, number>>
  storeResult: (result: Either<Error, number>) => void
}

export type HealthcheckDependencies<SupportedHealthchecks extends string> = {
  healthcheckStore: HealthcheckResultsStore<SupportedHealthchecks>
}

const metricsRegistered = new Map<string, boolean>()

export abstract class AbstractHealthcheck<SupportedHealthchecks extends string>
  implements Healthcheck
{
  readonly areMetricsEnabled: boolean

  private readonly store: HealthcheckResultsStore<SupportedHealthchecks>

  // returns execution time in msecs if successful
  abstract check(): Promise<Either<Error, number>>

  abstract getId(): SupportedHealthchecks

  protected constructor(
    dependencies: HealthcheckDependencies<SupportedHealthchecks>,
    areMetricsEnabled: boolean,
  ) {
    this.areMetricsEnabled = areMetricsEnabled
    this.store = dependencies.healthcheckStore

    if (areMetricsEnabled) {
      this.instantiateMetrics()
    }
  }

  instantiateMetrics(): void {
    const id = this.getId()
    if (!this.areMetricsEnabled || metricsRegistered.get(id)) {
      return
    }
    const store = this.store
    new Gauge({
      name: `${id}_availability`,
      help: `Whether ${id} was available at the time`,
      collect() {
        const checkResult = store.getHealthcheckResult(id)
        this.set(checkResult.result ? 1 : 0)
      },
    })
    new Gauge({
      name: `${id}_latency_msecs`,
      help: `How long the healthcheck for ${id} took`,
      collect() {
        const checkLength = store.getHealthcheckLatency(id)
        this.set(checkLength ?? 0)
      },
    })

    metricsRegistered.set(id, true)
  }

  async execute(): Promise<void> {
    const result = await this.check()
    this.storeResult(result)
  }
  storeResult(result: Either<Error, number>): void {
    const id = this.getId()
    this.store.set(id, {
      latency: result.error ? undefined : result.result,
      checkTimestamp: new Date(),
      isSuccessful: !result.error,
      errorMessage: result.error ? result.error.message : undefined,
    })
  }
}
