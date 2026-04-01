import type promClient from 'prom-client'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { AbstractDimensionalCounterMetric } from './AbstractDimensionalCounterMetric.ts'

class ConcreteDimensionalCounterMetric extends AbstractDimensionalCounterMetric<
  ['successful', 'failed']
> {
  constructor(client?: typeof promClient) {
    super(
      {
        namePrefix: 'workflow_run:entitlements',
        nameSuffix: 'counter',
        helpDescription: 'Number of workflow runs per status',
        dimensions: ['successful', 'failed'],
      },
      client,
    )
  }
}

describe('AbstractDimensionalCounterMetric', () => {
  let incMock: Mock
  let counterMock: Mock
  let getSingleMetricMock: Mock
  let client: typeof promClient

  beforeEach(() => {
    incMock = vi.fn()
    // biome-ignore lint/complexity/useArrowFunction: required for vitest
    counterMock = vi.fn().mockImplementation(function () {
      return { inc: incMock }
    })
    getSingleMetricMock = vi.fn()
    client = {
      Counter: counterMock,
      register: { getSingleMetric: getSingleMetricMock },
    } as any as typeof promClient
  })

  describe('registerMeasurement', () => {
    it('gracefully aborts if metrics are not enabled', () => {
      // Given
      const metric = new ConcreteDimensionalCounterMetric(undefined)

      // When
      metric.registerMeasurement({ successful: 20, failed: 10 })

      // Then
      expect(counterMock).not.toHaveBeenCalled()
      expect(incMock).not.toHaveBeenCalled()
    })

    it('initializes correctly with 0 values for all dimensions', () => {
      // Given
      getSingleMetricMock.mockReturnValue(undefined)

      // When
      new ConcreteDimensionalCounterMetric(client)

      // Then
      expect(getSingleMetricMock).toHaveBeenCalledWith(
        'workflow_run:entitlements_successful:counter',
      )
      expect(getSingleMetricMock).toHaveBeenCalledWith('workflow_run:entitlements_failed:counter')
      expect(counterMock).toHaveBeenCalledWith({
        name: 'workflow_run:entitlements_successful:counter',
        help: 'Number of workflow runs per status',
        labelNames: [],
      })
      expect(counterMock).toHaveBeenCalledWith({
        name: 'workflow_run:entitlements_failed:counter',
        help: 'Number of workflow runs per status',
        labelNames: [],
      })
      expect(incMock).toHaveBeenCalledTimes(2)
      expect(incMock).toHaveBeenCalledWith(0)
    })

    it('reuses existing metric per dimension when already registered', () => {
      // Given
      const existingCounter = { inc: incMock }
      getSingleMetricMock.mockReturnValue(existingCounter)

      // When
      new ConcreteDimensionalCounterMetric(client)

      // Then
      expect(counterMock).not.toHaveBeenCalled()
      expect(incMock).toHaveBeenCalledTimes(2)
      expect(incMock).toHaveBeenCalledWith(0)
    })

    it('registers all measurements properly', () => {
      // Given
      getSingleMetricMock.mockReturnValue(undefined)
      const metric = new ConcreteDimensionalCounterMetric(client)
      incMock.mockClear()

      // When
      metric.registerMeasurement({ successful: 20, failed: 10 })

      // Then
      expect(incMock).toHaveBeenCalledTimes(2)
      expect(incMock).toHaveBeenCalledWith(20)
      expect(incMock).toHaveBeenCalledWith(10)
    })

    it('registers selected measurements only', () => {
      // Given
      getSingleMetricMock.mockReturnValue(undefined)
      const metric = new ConcreteDimensionalCounterMetric(client)
      incMock.mockClear()

      // When
      metric.registerMeasurement({ successful: 20 })

      // Then
      expect(incMock).toHaveBeenCalledTimes(1)
      expect(incMock).toHaveBeenCalledWith(20)
    })

    it('should ignore measurements if client is not provided', () => {
      // Given
      const metric = new ConcreteDimensionalCounterMetric()

      // When
      metric.registerMeasurement({ successful: 20 })

      // Then
      expect(incMock).not.toHaveBeenCalled()
    })
  })
})
