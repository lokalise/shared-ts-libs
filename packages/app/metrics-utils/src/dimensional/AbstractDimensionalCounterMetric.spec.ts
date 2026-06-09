import type promClient from 'prom-client'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { AbstractDimensionalCounterMetric } from './AbstractDimensionalCounterMetric.ts'

class ConcreteDimensionalCounterMetric extends AbstractDimensionalCounterMetric<
  ['successful', 'failed']
> {
  constructor(client?: typeof promClient) {
    super(
      {
        helpDescription: 'Number of workflow runs per status',
        dimensions: ['successful', 'failed'],
        buildMetricName: (dimension) => `workflow_run:entitlements_${dimension}:counter`,
      },
      client,
    )
  }
}

class LazyConcreteDimensionalCounterMetric extends AbstractDimensionalCounterMetric<
  ['successful', 'failed']
> {
  constructor(client?: typeof promClient) {
    super(
      {
        helpDescription: 'Lazy counter',
        dimensions: ['successful', 'failed'],
        lazyInit: true,
        buildMetricName: (dimension) => `lazy_${dimension}:counter`,
      },
      client,
    )
  }
}

class LazyUnboundedDimensionalCounterMetric extends AbstractDimensionalCounterMetric<
  readonly string[]
> {
  constructor(client?: typeof promClient) {
    super(
      {
        helpDescription: 'Lazy unbounded counter',
        lazyInit: true,
        buildMetricName: (dimension) => `unbounded_${dimension}:counter`,
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
      expect(incMock).not.toHaveBeenCalled()
    })

    it('registers measurements properly', () => {
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

    it('should ignore measurements if client is not provided', () => {
      // Given
      const metric = new ConcreteDimensionalCounterMetric()

      // When
      metric.registerMeasurement({ successful: 20 })

      // Then
      expect(incMock).not.toHaveBeenCalled()
    })

    it('skips dimensions with undefined value', () => {
      // Given
      getSingleMetricMock.mockReturnValue(undefined)
      const metric = new ConcreteDimensionalCounterMetric(client)
      incMock.mockClear()

      // When
      metric.registerMeasurement({ successful: 20, failed: undefined })

      // Then
      expect(incMock).toHaveBeenCalledTimes(1)
      expect(incMock).toHaveBeenCalledWith(20)
    })

    it('silently ignores a dimension not declared in eager mode', () => {
      // Given
      getSingleMetricMock.mockReturnValue(undefined)
      const metric = new ConcreteDimensionalCounterMetric(client)
      incMock.mockClear()

      // When + Then — TS normally blocks this; cast bypasses to test runtime.
      expect(() => metric.registerMeasurement({ unknown: 1 } as any)).not.toThrow()
      expect(incMock).not.toHaveBeenCalled()
    })

    it('still applies known dimensions when the same measurement carries an unknown one', () => {
      // Given
      getSingleMetricMock.mockReturnValue(undefined)
      const metric = new ConcreteDimensionalCounterMetric(client)
      incMock.mockClear()

      // When — unknown sits between two valid dimensions to guard against partial application.
      metric.registerMeasurement({ successful: 2, unknown: 1, failed: 3 } as any)

      // Then
      expect(incMock).toHaveBeenCalledTimes(2)
      expect(incMock).toHaveBeenCalledWith(2)
      expect(incMock).toHaveBeenCalledWith(3)
    })
  })

  describe('lazyInit', () => {
    it('does not pre-register any metric at construction time', () => {
      // Given
      getSingleMetricMock.mockReturnValue(undefined)

      // When
      new LazyConcreteDimensionalCounterMetric(client)

      // Then
      expect(getSingleMetricMock).not.toHaveBeenCalled()
      expect(counterMock).not.toHaveBeenCalled()
      expect(incMock).not.toHaveBeenCalled()
    })

    it('creates the metric on first registerMeasurement for a dimension', () => {
      // Given
      getSingleMetricMock.mockReturnValue(undefined)
      const metric = new LazyConcreteDimensionalCounterMetric(client)

      // When
      metric.registerMeasurement({ successful: 5 })

      // Then
      expect(counterMock).toHaveBeenCalledTimes(1)
      expect(counterMock).toHaveBeenCalledWith({
        name: 'lazy_successful:counter',
        help: 'Lazy counter',
        labelNames: [],
      })
      expect(incMock).toHaveBeenCalledWith(5)
    })

    it('reuses the same metric on subsequent calls for the same dimension', () => {
      // Given
      getSingleMetricMock.mockReturnValue(undefined)
      const metric = new LazyConcreteDimensionalCounterMetric(client)

      // When
      metric.registerMeasurement({ successful: 5 })
      metric.registerMeasurement({ successful: 3 })

      // Then
      expect(counterMock).toHaveBeenCalledTimes(1)
      expect(incMock).toHaveBeenCalledTimes(2)
      expect(incMock).toHaveBeenNthCalledWith(1, 5)
      expect(incMock).toHaveBeenNthCalledWith(2, 3)
    })

    it('creates a new metric when a previously unseen dimension is measured', () => {
      // Given
      getSingleMetricMock.mockReturnValue(undefined)
      const metric = new LazyConcreteDimensionalCounterMetric(client)

      // When
      metric.registerMeasurement({ successful: 5 })
      metric.registerMeasurement({ failed: 1 })

      // Then
      expect(counterMock).toHaveBeenCalledTimes(2)
      const createdNames = counterMock.mock.calls.map((c) => c[0].name)
      expect(createdNames).toEqual(['lazy_successful:counter', 'lazy_failed:counter'])
    })

    it('respects existing registry entries (getSingleMetric hit)', () => {
      // Given
      const existingCounter = { inc: incMock }
      getSingleMetricMock.mockReturnValue(existingCounter)
      const metric = new LazyConcreteDimensionalCounterMetric(client)

      // When
      metric.registerMeasurement({ successful: 7 })

      // Then
      expect(getSingleMetricMock).toHaveBeenCalledWith('lazy_successful:counter')
      expect(counterMock).not.toHaveBeenCalled()
      expect(incMock).toHaveBeenCalledWith(7)
    })

    it('is a no-op when no client is provided', () => {
      // Given
      const metric = new LazyConcreteDimensionalCounterMetric()

      // When
      metric.registerMeasurement({ successful: 5 })

      // Then
      expect(counterMock).not.toHaveBeenCalled()
      expect(incMock).not.toHaveBeenCalled()
    })

    it('silently ignores a dimension outside the declared allow-list', () => {
      // Given
      getSingleMetricMock.mockReturnValue(undefined)
      const metric = new LazyConcreteDimensionalCounterMetric(client)

      // When + Then
      expect(() => metric.registerMeasurement({ unknown: 1 } as any)).not.toThrow()
      expect(counterMock).not.toHaveBeenCalled()
      expect(incMock).not.toHaveBeenCalled()
    })

    describe('without allow-list (dimensions omitted)', () => {
      it('accepts any dimension and registers it on first measurement', () => {
        // Given
        getSingleMetricMock.mockReturnValue(undefined)
        const metric = new LazyUnboundedDimensionalCounterMetric(client)

        // When
        metric.registerMeasurement({ whatever: 5, something_else: 2 })

        // Then
        expect(counterMock).toHaveBeenCalledTimes(2)
        const createdNames = counterMock.mock.calls.map((c) => c[0].name)
        expect(createdNames).toEqual([
          'unbounded_whatever:counter',
          'unbounded_something_else:counter',
        ])
        expect(incMock).toHaveBeenCalledWith(5)
        expect(incMock).toHaveBeenCalledWith(2)
      })

      it('reuses the metric across calls with the same dimension', () => {
        // Given
        getSingleMetricMock.mockReturnValue(undefined)
        const metric = new LazyUnboundedDimensionalCounterMetric(client)

        // When
        metric.registerMeasurement({ foo: 1 })
        metric.registerMeasurement({ foo: 2 })

        // Then
        expect(counterMock).toHaveBeenCalledTimes(1)
        expect(incMock).toHaveBeenCalledTimes(2)
      })
    })
  })
})
