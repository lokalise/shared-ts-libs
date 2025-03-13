import { randomUUID } from 'node:crypto'
import type { PeriodicJobDependencies } from '@lokalise/background-jobs-common'
import {
  type Either,
  type TransactionObservabilityManager,
  globalLogger,
} from '@lokalise/node-core'
import { Redis } from 'ioredis'
import { ToadScheduler } from 'toad-scheduler'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getTestRedisConfig } from '../test/setup.js'
import { HealthcheckRefreshJob } from './HealthcheckRefreshJob.js'
import { HealthcheckResultsStore } from './HealthcheckResultsStore.js'
import {
  AbstractHealthcheck,
  type Healthcheck,
  type HealthcheckDependencies,
} from './healthchecks.js'

type SupportedHealthchecks = 'test' | 'test2'

class TestHealthcheck extends AbstractHealthcheck<SupportedHealthchecks> implements Healthcheck {
  private readonly throwError: boolean

  constructor(
    dependencies: HealthcheckDependencies<SupportedHealthchecks>,
    areMetricsEnabled: boolean,
    throwError = false,
  ) {
    super(dependencies, areMetricsEnabled)
    this.throwError = throwError
  }

  getId(): SupportedHealthchecks {
    return 'test'
  }

  check(): Promise<Either<Error, number>> {
    return this.throwError
      ? Promise.resolve({ error: new Error('error') })
      : Promise.resolve({ result: 5 })
  }
}

class TestHealthcheck2 extends AbstractHealthcheck<SupportedHealthchecks> implements Healthcheck {
  private readonly throwError: boolean

  constructor(
    dependencies: HealthcheckDependencies<SupportedHealthchecks>,
    areMetricsEnabled: boolean,
    throwError = false,
  ) {
    super(dependencies, areMetricsEnabled)
    this.throwError = throwError
  }

  getId(): SupportedHealthchecks {
    return 'test2'
  }

  check(): Promise<Either<Error, number>> {
    return this.throwError
      ? Promise.resolve({ error: new Error('error') })
      : Promise.resolve({ result: 5 })
  }
}

const transactionObservabilityManager: TransactionObservabilityManager = {
  /* v8 ignore next 4 */
  start: () => {},
  startWithGroup: () => {},
  stop: () => {},
  addCustomAttributes: () => {},
}

let store: HealthcheckResultsStore<SupportedHealthchecks>
let redis: Redis

function getTestDependencies(): PeriodicJobDependencies {
  return {
    errorReporter: { report: () => {} },
    logger: globalLogger,
    scheduler: new ToadScheduler(),
    transactionObservabilityManager,
    redis,
  }
}

describe('HealthcheckRefreshJob', () => {
  let job: HealthcheckRefreshJob
  beforeAll(() => {
    redis = new Redis(getTestRedisConfig())
    store = new HealthcheckResultsStore({ maxHealthcheckNumber: 1 })
  })
  beforeEach(() => {
    store.resetHealthcheckStores()
  })
  afterAll(() => {
    redis.disconnect()
  })

  it('updates successful redis healthcheck', async () => {
    const healthchecks = [
      new TestHealthcheck(
        {
          healthcheckStore: store,
        },
        true,
        false,
      ),

      new TestHealthcheck2(
        {
          healthcheckStore: store,
        },
        true,
        false,
      ),
    ]
    job = new HealthcheckRefreshJob(getTestDependencies(), healthchecks)

    await job.process(randomUUID())

    const healthcheckSuccess = store.getHealthcheckResult('test')
    expect(healthcheckSuccess).toBe(true)
  })

  it('updates failed redis healthcheck', async () => {
    const healthchecks = [
      new TestHealthcheck(
        {
          healthcheckStore: store,
        },
        true,
        true,
      ),
    ]
    job = new HealthcheckRefreshJob(getTestDependencies(), healthchecks)

    await job.process(randomUUID())

    const healthcheckSuccess = store.getHealthcheckResult('test')
    expect(healthcheckSuccess).toBe(false)
  })
})
