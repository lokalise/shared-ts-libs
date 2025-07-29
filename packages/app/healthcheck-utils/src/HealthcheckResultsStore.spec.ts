import { beforeEach, describe, expect, it } from 'vitest'
import {
  HealthcheckResultsStore,
  type HealthcheckResultsStoreParams,
} from './HealthcheckResultsStore.ts'

const testParams: HealthcheckResultsStoreParams = {
  maxHealthcheckNumber: 2,
  healthCheckResultTtlInMsecs: 5000,
}

type TestHealthchecks = 'db' | 'redis'

describe('HealthcheckResultsStore', () => {
  let store: HealthcheckResultsStore<TestHealthchecks>
  beforeEach(() => {
    store = new HealthcheckResultsStore(testParams)
  })

  describe('getHealthcheckResult', () => {
    it('returns false for fresh undefined values', () => {
      const value = store.getHealthcheckResult('db')

      expect(value).toStrictEqual({
        error: 'Healthcheck result for db is not available',
        result: false,
      })
    })

    it('returns true for defined values', () => {
      store.set('db', {
        checkTimestamp: new Date(),
        isSuccessful: true,
        latency: 11,
      })

      const value = store.getHealthcheckResult('db')

      expect(value).toStrictEqual({
        result: true,
      })
    })

    it('returns false and error reason for failed check', () => {
      store.set('db', {
        checkTimestamp: new Date(),
        errorMessage: 'Database connection failed',
      })

      const value = store.getHealthcheckResult('db')

      expect(value).toStrictEqual({
        error: 'Database connection failed',
        result: false,
      })
    })

    it('returns false for stale undefined values', () => {
      store.set('db', {
        checkTimestamp: new Date(2022),
      })

      const value = store.getHealthcheckResult('db')

      expect(value).toStrictEqual({
        error: undefined,
        result: false,
      })
    })
  })

  describe('getHealthcheckLatency', () => {
    it('returns undefined for undefined values', () => {
      const value = store.getHealthcheckLatency('db')

      expect(value).toBe(undefined)
    })

    it('returns true for defined values', () => {
      store.set('db', {
        checkTimestamp: new Date(),
        isSuccessful: true,
        latency: 11,
      })

      const value = store.getHealthcheckLatency('db')

      expect(value).toBe(11)
    })
  })
})
