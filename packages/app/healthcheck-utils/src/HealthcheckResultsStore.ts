import type { DefiniteEither, Either } from '@lokalise/node-core'
import { FifoMap } from 'toad-cache'

export type HealthcheckEntry = {
  isSuccessful?: boolean
  errorMessage?: string
  checkTimestamp: Date
  latency?: number
}

export type HealthcheckResultsStoreParams = {
  maxHealthcheckNumber: number // maximum amount of healthchecks that the system can have
  healthCheckResultTtlInMsecs?: number
}

const DEFAULT_HEALTHCHECK_TTL_IN_MSECS = 40000

export class HealthcheckResultsStore<SupportedHealthchecks extends string> {
  private readonly store: FifoMap<HealthcheckEntry>

  constructor(params: HealthcheckResultsStoreParams) {
    this.store = new FifoMap<HealthcheckEntry>(
      params.maxHealthcheckNumber,
      params.healthCheckResultTtlInMsecs ?? DEFAULT_HEALTHCHECK_TTL_IN_MSECS,
    )
  }

  set(healthcheck: SupportedHealthchecks, result: HealthcheckEntry) {
    this.store.set(healthcheck, result)
  }

  /**
   * Returns true if the healthcheck is successful, false if it is not, plus error message if it provided.
   */
  getHealthcheckResult(healthcheck: SupportedHealthchecks): DefiniteEither<string, boolean> {
    const healthcheckEntry = this.store.get(healthcheck)
    // If we don't have any results yet, we assume the service is not healthy
    if (!healthcheckEntry) {
      return {
        error: `Healthcheck result for ${healthcheck} is not available`,
        result: false,
      }
    }

    if (healthcheckEntry.isSuccessful) {
      return { result: true }
    }

    return {
      error: healthcheckEntry.errorMessage,
      result: false,
    }
  }

  getAsyncHealthCheckResult(healthCheck: SupportedHealthchecks): Promise<Either<Error, true>> {
    const checkResult = this.getHealthcheckResult(healthCheck)
    if (!checkResult.result) {
      return Promise.resolve({
        error: new Error(
          `Error occurred during ${healthCheck} healthcheck: ${checkResult.error ?? 'unknown error'}`,
        ),
      })
    }
    return Promise.resolve({ result: true })
  }

  getHealthcheckLatency(healthcheck: SupportedHealthchecks): number | undefined {
    const healthcheckEntry = this.store.get(healthcheck)
    if (!healthcheckEntry) {
      return undefined
    }

    return healthcheckEntry.latency
  }

  resetHealthcheckStores() {
    this.store.clear()
  }
}
