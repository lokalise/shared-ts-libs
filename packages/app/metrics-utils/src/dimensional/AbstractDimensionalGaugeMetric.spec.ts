import type promClient from 'prom-client'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { AbstractDimensionalGaugeMetric } from './AbstractDimensionalGaugeMetric.ts'

class ConcreteDimensionalGaugeMetric extends AbstractDimensionalGaugeMetric<['active', 'idle']> {
  constructor(client?: typeof promClient) {
    super(
      {
        helpDescription: 'Number of connections per state',
        dimensions: ['active', 'idle'],
        buildMetricName: (dimension) => `connections_${dimension}:gauge`,
      },
      client,
    )
  }
}

class LazyConcreteDimensionalGaugeMetric extends AbstractDimensionalGaugeMetric<
  ['active', 'idle']
> {
  constructor(client?: typeof promClient) {
    super(
      {
        helpDescription: 'Lazy gauge',
        dimensions: ['active', 'idle'],
        lazyInit: true,
        buildMetricName: (dimension) => `lazy_${dimension}:gauge`,
      },
      client,
    )
  }
}

class LazyUnboundedDimensionalGaugeMetric extends AbstractDimensionalGaugeMetric<
  readonly string[]
> {
  constructor(client?: typeof promClient) {
    super(
      {
        helpDescription: 'Lazy unbounded gauge',
        lazyInit: true,
        buildMetricName: (dimension) => `unbounded_${dimension}:gauge`,
      },
      client,
    )
  }
}

describe('AbstractDimensionalGaugeMetric', () => {
  let setMock: Mock
  let gaugeMock: Mock
  let getSingleMetricMock: Mock
  let client: typeof promClient

  beforeEach(() => {
    setMock = vi.fn()
    // biome-ignore lint/complexity/useArrowFunction: required for vitest
    gaugeMock = vi.fn().mockImplementation(function () {
      return { set: setMock }
    })
    getSingleMetricMock = vi.fn()
    client = {
      Gauge: gaugeMock,
      register: { getSingleMetric: getSingleMetricMock },
    } as any as typeof promClient
  })

  describe('registerMeasurement', () => {
    it('gracefully aborts if metrics are not enabled', () => {
      // Given
      const metric = new ConcreteDimensionalGaugeMetric(undefined)

      // When
      metric.registerMeasurement({ active: 20, idle: 10 })

      // Then
      expect(gaugeMock).not.toHaveBeenCalled()
      expect(setMock).not.toHaveBeenCalled()
    })

    it('initializes correctly with 0 values for all dimensions', () => {
      // Given
      getSingleMetricMock.mockReturnValue(undefined)

      // When
      new ConcreteDimensionalGaugeMetric(client)

      // Then
      expect(getSingleMetricMock).toHaveBeenCalledWith('connections_active:gauge')
      expect(getSingleMetricMock).toHaveBeenCalledWith('connections_idle:gauge')
      expect(gaugeMock).toHaveBeenCalledWith({
        name: 'connections_active:gauge',
        help: 'Number of connections per state',
        labelNames: [],
      })
      expect(gaugeMock).toHaveBeenCalledWith({
        name: 'connections_idle:gauge',
        help: 'Number of connections per state',
        labelNames: [],
      })
      expect(setMock).toHaveBeenCalledTimes(2)
      expect(setMock).toHaveBeenCalledWith(0)
    })

    it('reuses existing metric per dimension when already registered', () => {
      // Given
      const existingGauge = { set: setMock }
      getSingleMetricMock.mockReturnValue(existingGauge)

      // When
      new ConcreteDimensionalGaugeMetric(client)

      // Then
      expect(gaugeMock).not.toHaveBeenCalled()
      expect(setMock).not.toHaveBeenCalled()
    })

    it('registers measurements properly', () => {
      // Given
      getSingleMetricMock.mockReturnValue(undefined)
      const metric = new ConcreteDimensionalGaugeMetric(client)
      setMock.mockClear()

      // When
      metric.registerMeasurement({ active: 20, idle: 10 })

      // Then
      expect(setMock).toHaveBeenCalledTimes(2)
      expect(setMock).toHaveBeenCalledWith(20)
      expect(setMock).toHaveBeenCalledWith(10)
    })

    it('sets a value of 0 (does not treat it as undefined)', () => {
      // Given
      getSingleMetricMock.mockReturnValue(undefined)
      const metric = new ConcreteDimensionalGaugeMetric(client)
      setMock.mockClear()

      // When
      metric.registerMeasurement({ active: 0 })

      // Then
      expect(setMock).toHaveBeenCalledTimes(1)
      expect(setMock).toHaveBeenCalledWith(0)
    })

    it('should ignore measurements if client is not provided', () => {
      // Given
      const metric = new ConcreteDimensionalGaugeMetric()

      // When
      metric.registerMeasurement({ active: 20 })

      // Then
      expect(setMock).not.toHaveBeenCalled()
    })

    it('skips dimensions with undefined value', () => {
      // Given
      getSingleMetricMock.mockReturnValue(undefined)
      const metric = new ConcreteDimensionalGaugeMetric(client)
      setMock.mockClear()

      // When
      metric.registerMeasurement({ active: 20, idle: undefined })

      // Then
      expect(setMock).toHaveBeenCalledTimes(1)
      expect(setMock).toHaveBeenCalledWith(20)
    })

    it('silently ignores a dimension not declared in eager mode', () => {
      // Given
      getSingleMetricMock.mockReturnValue(undefined)
      const metric = new ConcreteDimensionalGaugeMetric(client)
      setMock.mockClear()

      // When + Then — TS normally blocks this; cast bypasses to test runtime.
      expect(() => metric.registerMeasurement({ unknown: 1 } as any)).not.toThrow()
      expect(setMock).not.toHaveBeenCalled()
    })

    it('still applies known dimensions when the same measurement carries an unknown one', () => {
      // Given
      getSingleMetricMock.mockReturnValue(undefined)
      const metric = new ConcreteDimensionalGaugeMetric(client)
      setMock.mockClear()

      // When — unknown sits between two valid dimensions to guard against partial application.
      metric.registerMeasurement({ active: 2, unknown: 1, idle: 3 } as any)

      // Then
      expect(setMock).toHaveBeenCalledTimes(2)
      expect(setMock).toHaveBeenCalledWith(2)
      expect(setMock).toHaveBeenCalledWith(3)
    })
  })

  describe('lazyInit', () => {
    it('does not pre-register any metric at construction time', () => {
      // Given
      getSingleMetricMock.mockReturnValue(undefined)

      // When
      new LazyConcreteDimensionalGaugeMetric(client)

      // Then
      expect(getSingleMetricMock).not.toHaveBeenCalled()
      expect(gaugeMock).not.toHaveBeenCalled()
      expect(setMock).not.toHaveBeenCalled()
    })

    it('creates the metric on first registerMeasurement for a dimension', () => {
      // Given
      getSingleMetricMock.mockReturnValue(undefined)
      const metric = new LazyConcreteDimensionalGaugeMetric(client)

      // When
      metric.registerMeasurement({ active: 5 })

      // Then
      expect(gaugeMock).toHaveBeenCalledTimes(1)
      expect(gaugeMock).toHaveBeenCalledWith({
        name: 'lazy_active:gauge',
        help: 'Lazy gauge',
        labelNames: [],
      })
      expect(setMock).toHaveBeenCalledWith(5)
    })

    it('reuses the same metric on subsequent calls for the same dimension', () => {
      // Given
      getSingleMetricMock.mockReturnValue(undefined)
      const metric = new LazyConcreteDimensionalGaugeMetric(client)

      // When
      metric.registerMeasurement({ active: 5 })
      metric.registerMeasurement({ active: 3 })

      // Then
      expect(gaugeMock).toHaveBeenCalledTimes(1)
      expect(setMock).toHaveBeenCalledTimes(2)
      expect(setMock).toHaveBeenNthCalledWith(1, 5)
      expect(setMock).toHaveBeenNthCalledWith(2, 3)
    })

    it('respects existing registry entries (getSingleMetric hit)', () => {
      // Given
      const existingGauge = { set: setMock }
      getSingleMetricMock.mockReturnValue(existingGauge)
      const metric = new LazyConcreteDimensionalGaugeMetric(client)

      // When
      metric.registerMeasurement({ active: 7 })

      // Then
      expect(getSingleMetricMock).toHaveBeenCalledWith('lazy_active:gauge')
      expect(gaugeMock).not.toHaveBeenCalled()
      expect(setMock).toHaveBeenCalledWith(7)
    })

    it('is a no-op when no client is provided', () => {
      // Given
      const metric = new LazyConcreteDimensionalGaugeMetric()

      // When
      metric.registerMeasurement({ active: 5 })

      // Then
      expect(gaugeMock).not.toHaveBeenCalled()
      expect(setMock).not.toHaveBeenCalled()
    })

    it('silently ignores a dimension outside the declared allow-list', () => {
      // Given
      getSingleMetricMock.mockReturnValue(undefined)
      const metric = new LazyConcreteDimensionalGaugeMetric(client)

      // When + Then
      expect(() => metric.registerMeasurement({ unknown: 1 } as any)).not.toThrow()
      expect(gaugeMock).not.toHaveBeenCalled()
      expect(setMock).not.toHaveBeenCalled()
    })

    describe('without allow-list (dimensions omitted)', () => {
      it('accepts any dimension and registers it on first measurement', () => {
        // Given
        getSingleMetricMock.mockReturnValue(undefined)
        const metric = new LazyUnboundedDimensionalGaugeMetric(client)

        // When
        metric.registerMeasurement({ whatever: 5, something_else: 2 })

        // Then
        expect(gaugeMock).toHaveBeenCalledTimes(2)
        const createdNames = gaugeMock.mock.calls.map((c) => c[0].name)
        expect(createdNames).toEqual(['unbounded_whatever:gauge', 'unbounded_something_else:gauge'])
        expect(setMock).toHaveBeenCalledWith(5)
        expect(setMock).toHaveBeenCalledWith(2)
      })

      it('reuses the metric across calls with the same dimension', () => {
        // Given
        getSingleMetricMock.mockReturnValue(undefined)
        const metric = new LazyUnboundedDimensionalGaugeMetric(client)

        // When
        metric.registerMeasurement({ foo: 1 })
        metric.registerMeasurement({ foo: 2 })

        // Then
        expect(gaugeMock).toHaveBeenCalledTimes(1)
        expect(setMock).toHaveBeenCalledTimes(2)
      })
    })
  })
})
