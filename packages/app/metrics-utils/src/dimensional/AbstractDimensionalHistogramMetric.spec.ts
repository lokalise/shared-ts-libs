import type promClient from 'prom-client'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { AbstractDimensionalHistogramMetric } from './AbstractDimensionalHistogramMetric.ts'

class ConcreteDimensionalHistogramMetric extends AbstractDimensionalHistogramMetric<
  ['successful', 'failed']
> {
  constructor(client?: typeof promClient) {
    super(
      {
        helpDescription: 'Duration of workflow runs per status',
        dimensions: ['successful', 'failed'],
        buckets: [1, 2, 3],
        buildMetricName: (dimension) => `workflow_run:entitlements_${dimension}:histogram`,
      },
      client,
    )
  }
}

class LazyConcreteDimensionalHistogramMetric extends AbstractDimensionalHistogramMetric<
  ['successful', 'failed']
> {
  constructor(client?: typeof promClient) {
    super(
      {
        helpDescription: 'Lazy histogram',
        dimensions: ['successful', 'failed'],
        lazyInit: true,
        buckets: [1, 2, 3],
        buildMetricName: (dimension) => `lazy_${dimension}:histogram`,
      },
      client,
    )
  }
}

class LazyUnboundedDimensionalHistogramMetric extends AbstractDimensionalHistogramMetric<
  readonly string[]
> {
  constructor(client?: typeof promClient) {
    super(
      {
        helpDescription: 'Lazy unbounded histogram',
        lazyInit: true,
        buckets: [1, 2, 3],
        buildMetricName: (dimension) => `unbounded_${dimension}:histogram`,
      },
      client,
    )
  }
}

describe('AbstractDimensionalHistogramMetric', () => {
  let observeMock: Mock
  let histogramMock: Mock
  let getSingleMetricMock: Mock
  let client: typeof promClient

  beforeEach(() => {
    observeMock = vi.fn()
    // biome-ignore lint/complexity/useArrowFunction: required for vitest
    histogramMock = vi.fn().mockImplementation(function () {
      return { observe: observeMock }
    })
    getSingleMetricMock = vi.fn()
    client = {
      Histogram: histogramMock,
      register: { getSingleMetric: getSingleMetricMock },
    } as any as typeof promClient
  })

  describe('registerMeasurement', () => {
    it('gracefully aborts if metrics are not enabled', () => {
      // Given
      const metric = new ConcreteDimensionalHistogramMetric(undefined)

      // When
      metric.registerMeasurement({ dimension: 'successful', time: 100 })

      // Then
      expect(observeMock).not.toHaveBeenCalled()
    })

    it('initializes correctly and registers measurement with time', () => {
      // Given
      getSingleMetricMock.mockReturnValue(undefined)

      // When
      const metric = new ConcreteDimensionalHistogramMetric(client)
      metric.registerMeasurement({ dimension: 'successful', time: 100 })

      // Then
      expect(getSingleMetricMock).toHaveBeenCalledWith(
        'workflow_run:entitlements_successful:histogram',
      )
      expect(getSingleMetricMock).toHaveBeenCalledWith('workflow_run:entitlements_failed:histogram')
      expect(histogramMock).toHaveBeenCalledWith({
        name: 'workflow_run:entitlements_successful:histogram',
        help: 'Duration of workflow runs per status',
        buckets: [1, 2, 3],
        labelNames: [],
      })
      expect(histogramMock).toHaveBeenCalledWith({
        name: 'workflow_run:entitlements_failed:histogram',
        help: 'Duration of workflow runs per status',
        buckets: [1, 2, 3],
        labelNames: [],
      })
      expect(observeMock).toHaveBeenCalledWith({}, 100)
    })

    it('registers measurement with startTime and endTime', () => {
      // Given
      getSingleMetricMock.mockReturnValue(undefined)
      const metric = new ConcreteDimensionalHistogramMetric(client)

      // When
      metric.registerMeasurement({ dimension: 'failed', startTime: 100, endTime: 150 })

      // Then
      expect(observeMock).toHaveBeenCalledWith({}, 50)
    })

    it('reuses existing metric per dimension when already registered', () => {
      // Given
      const existingHistogram = { observe: observeMock }
      getSingleMetricMock.mockReturnValue(existingHistogram)

      // When
      const metric = new ConcreteDimensionalHistogramMetric(client)
      metric.registerMeasurement({ dimension: 'successful', time: 75 })

      // Then
      expect(histogramMock).not.toHaveBeenCalled()
      expect(observeMock).toHaveBeenCalledWith({}, 75)
    })

    it('should ignore measurements if client is not provided', () => {
      // Given
      const metric = new ConcreteDimensionalHistogramMetric()

      // When
      metric.registerMeasurement({ dimension: 'successful', time: 100 })

      // Then
      expect(observeMock).not.toHaveBeenCalled()
    })

    it('throws when measuring a dimension not declared in eager mode', () => {
      // Given
      getSingleMetricMock.mockReturnValue(undefined)
      const metric = new ConcreteDimensionalHistogramMetric(client)

      // When + Then — TS normally blocks this; cast bypasses to test runtime.
      expect(() =>
        metric.registerMeasurement({ dimension: 'unknown' as 'successful', time: 100 }),
      ).toThrow(/Dimension "unknown" was not declared/)
    })
  })

  describe('lazyInit', () => {
    it('does not pre-register any metric at construction time', () => {
      // Given
      getSingleMetricMock.mockReturnValue(undefined)

      // When
      new LazyConcreteDimensionalHistogramMetric(client)

      // Then
      expect(getSingleMetricMock).not.toHaveBeenCalled()
      expect(histogramMock).not.toHaveBeenCalled()
      expect(observeMock).not.toHaveBeenCalled()
    })

    it('creates the metric on first registerMeasurement for a dimension', () => {
      // Given
      getSingleMetricMock.mockReturnValue(undefined)
      const metric = new LazyConcreteDimensionalHistogramMetric(client)

      // When
      metric.registerMeasurement({ dimension: 'successful', time: 100 })

      // Then
      expect(histogramMock).toHaveBeenCalledTimes(1)
      expect(histogramMock).toHaveBeenCalledWith({
        name: 'lazy_successful:histogram',
        help: 'Lazy histogram',
        buckets: [1, 2, 3],
        labelNames: [],
      })
      expect(observeMock).toHaveBeenCalledWith({}, 100)
    })

    it('reuses the same metric on subsequent calls for the same dimension', () => {
      // Given
      getSingleMetricMock.mockReturnValue(undefined)
      const metric = new LazyConcreteDimensionalHistogramMetric(client)

      // When
      metric.registerMeasurement({ dimension: 'successful', time: 100 })
      metric.registerMeasurement({ dimension: 'successful', startTime: 200, endTime: 250 })

      // Then
      expect(histogramMock).toHaveBeenCalledTimes(1)
      expect(observeMock).toHaveBeenCalledTimes(2)
      expect(observeMock).toHaveBeenNthCalledWith(1, {}, 100)
      expect(observeMock).toHaveBeenNthCalledWith(2, {}, 50)
    })

    it('respects existing registry entries (getSingleMetric hit)', () => {
      // Given
      const existingHistogram = { observe: observeMock }
      getSingleMetricMock.mockReturnValue(existingHistogram)
      const metric = new LazyConcreteDimensionalHistogramMetric(client)

      // When
      metric.registerMeasurement({ dimension: 'successful', time: 75 })

      // Then
      expect(getSingleMetricMock).toHaveBeenCalledWith('lazy_successful:histogram')
      expect(histogramMock).not.toHaveBeenCalled()
      expect(observeMock).toHaveBeenCalledWith({}, 75)
    })

    it('is a no-op when no client is provided', () => {
      // Given
      const metric = new LazyConcreteDimensionalHistogramMetric()

      // When
      metric.registerMeasurement({ dimension: 'successful', time: 100 })

      // Then
      expect(histogramMock).not.toHaveBeenCalled()
      expect(observeMock).not.toHaveBeenCalled()
    })

    it('throws when measuring a dimension outside the declared allow-list', () => {
      // Given
      getSingleMetricMock.mockReturnValue(undefined)
      const metric = new LazyConcreteDimensionalHistogramMetric(client)

      // When + Then
      expect(() => metric.registerMeasurement({ dimension: 'unknown' as any, time: 100 })).toThrow(
        /Dimension "unknown" is not in the declared allow-list/,
      )
    })

    describe('without allow-list (dimensions omitted)', () => {
      it('accepts any dimension and registers it on first measurement', () => {
        // Given
        getSingleMetricMock.mockReturnValue(undefined)
        const metric = new LazyUnboundedDimensionalHistogramMetric(client)

        // When
        metric.registerMeasurement({ dimension: 'whatever', time: 75 })
        metric.registerMeasurement({ dimension: 'something_else', time: 42 })

        // Then
        expect(histogramMock).toHaveBeenCalledTimes(2)
        const createdNames = histogramMock.mock.calls.map((c) => c[0].name)
        expect(createdNames).toEqual([
          'unbounded_whatever:histogram',
          'unbounded_something_else:histogram',
        ])
        expect(observeMock).toHaveBeenNthCalledWith(1, {}, 75)
        expect(observeMock).toHaveBeenNthCalledWith(2, {}, 42)
      })

      it('reuses the metric across calls with the same dimension', () => {
        // Given
        getSingleMetricMock.mockReturnValue(undefined)
        const metric = new LazyUnboundedDimensionalHistogramMetric(client)

        // When
        metric.registerMeasurement({ dimension: 'foo', time: 10 })
        metric.registerMeasurement({ dimension: 'foo', time: 20 })

        // Then
        expect(histogramMock).toHaveBeenCalledTimes(1)
        expect(observeMock).toHaveBeenCalledTimes(2)
      })
    })
  })
})
