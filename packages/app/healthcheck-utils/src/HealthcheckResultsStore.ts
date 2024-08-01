import { FifoMap } from 'toad-cache'

export type HealthcheckEntry = {
  isSuccessful?: boolean
  errorMessage?: string
  checkTimestamp: Date
  latency?: number
}

export type HealthcheckResultsStoreParams = {
  healthcheckNumber: number // maximum amount of healthchecks that the system can have
  stalenessThresholdInMsecs?: number
  healthCheckResultTtlInMsecs?: number
}

const DEFAULT_STALENESS_THRESHOLD_IN_MSECS = 30000
const DEFAULT_HEALTHCHECK_TTL_IN_MSECS = 15000

export class HealthcheckResultsStore<SupportedHealthchecks extends string> {
  private readonly stalenessThresholdInMsecs: number
  private readonly store: FifoMap<HealthcheckEntry>

  constructor(params: HealthcheckResultsStoreParams) {
    this.stalenessThresholdInMsecs =
      params.stalenessThresholdInMsecs ?? DEFAULT_STALENESS_THRESHOLD_IN_MSECS
    this.store = new FifoMap<HealthcheckEntry>(
      params.healthcheckNumber,
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
    // If we don't have any results yet, we assume service is healthy
    if (!healthcheckEntry) {
      const emptyEntry: HealthcheckEntry = {
        checkTimestamp: new Date(),
      }
      this.store.set(healthcheck, emptyEntry)
      return true
    }

    if (healthcheckEntry.isSuccessful) {
      return true
    }

    if (healthcheckEntry.isSuccessful === false) {
      return false
    }

    // If we still don't have healthcheck results, check how old the undefined state is
    // If it is very stale, assume check is broken and report unhealthy service
    return isLessThanMSecsAgo(healthcheckEntry.checkTimestamp, this.stalenessThresholdInMsecs)
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

function isLessThanMSecsAgo(givenDate: Date, deltaInMsecs: number) {
  return Date.now() - givenDate.getTime() < deltaInMsecs
}
