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
   * Returns true if check is passing, false if not
   */
  getHealthcheckResult(healthcheck: SupportedHealthchecks): boolean {
    const healthcheckEntry = this.store.get(healthcheck)
    // If we don't have any results yet, we assume service is not healthy
    if (!healthcheckEntry) {
      return false
    }

    if (healthcheckEntry.isSuccessful) {
      return true
    }

    return false
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
