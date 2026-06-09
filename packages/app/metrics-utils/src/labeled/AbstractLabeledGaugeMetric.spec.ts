import type promClient from 'prom-client'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { AbstractLabeledGaugeMetric } from './AbstractLabeledGaugeMetric.ts'

class ConcreteGaugeMetric extends AbstractLabeledGaugeMetric<'status', ['active', 'idle']> {
  constructor(client?: typeof promClient) {
    super(
      {
        name: 'dummy_metric_name',
        helpDescription: 'Number of dummies per status',
        label: 'status',
        measurementKeys: ['active', 'idle'],
      },
      client,
    )
  }
}

describe('AbstractLabeledGaugeMetric', () => {
  let setMock: Mock
  let labelsMock: Mock
  let gaugeMock: Mock
  let getSingleMetricMock: Mock
  let client: typeof promClient

  beforeEach(() => {
    setMock = vi.fn()
    // biome-ignore lint/complexity/useArrowFunction: required for vitest
    labelsMock = vi.fn().mockImplementation(function () {
      return { set: setMock }
    })
    // biome-ignore lint/complexity/useArrowFunction: required for vitest
    gaugeMock = vi.fn().mockImplementation(function () {
      return { labels: labelsMock }
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
      const metric = new ConcreteGaugeMetric(undefined)

      // When
      metric.registerMeasurement({ active: 20, idle: 10 })

      // Then
      expect(labelsMock).not.toHaveBeenCalled()
      expect(setMock).not.toHaveBeenCalled()
    })

    it('initializes correctly with 0 values for all measurements', () => {
      // Given
      getSingleMetricMock.mockReturnValueOnce(undefined)

      // When
      new ConcreteGaugeMetric(client)

      // Then
      expect(getSingleMetricMock).toHaveBeenCalledWith('dummy_metric_name')
      expect(gaugeMock).toHaveBeenCalledWith({
        name: 'dummy_metric_name',
        help: 'Number of dummies per status',
        labelNames: ['status'],
      })
      expect(labelsMock).toHaveBeenCalledWith({ status: 'active' })
      expect(setMock).toHaveBeenNthCalledWith(1, 0)
      expect(labelsMock).toHaveBeenCalledWith({ status: 'idle' })
      expect(setMock).toHaveBeenNthCalledWith(2, 0)
    })

    it('registers all measurements properly', () => {
      // Given
      getSingleMetricMock.mockReturnValueOnce(gaugeMock())
      const metric = new ConcreteGaugeMetric(client)

      // When
      metric.registerMeasurement({ active: 20, idle: 10 })

      // Then
      expect(labelsMock).toHaveBeenCalledWith({ status: 'active' })
      expect(setMock).toHaveBeenNthCalledWith(1, 20)
      expect(labelsMock).toHaveBeenCalledWith({ status: 'idle' })
      expect(setMock).toHaveBeenNthCalledWith(2, 10)
    })

    it('registers selected measurements properly', () => {
      // Given
      getSingleMetricMock.mockReturnValueOnce(gaugeMock())
      const metric = new ConcreteGaugeMetric(client)

      // When
      metric.registerMeasurement({ active: 20 })

      // Then
      expect(labelsMock).toHaveBeenCalledWith({ status: 'active' })
      expect(setMock).toHaveBeenNthCalledWith(1, 20)
      expect(setMock).toHaveBeenCalledTimes(1)
      expect(labelsMock).not.toHaveBeenCalledWith({ status: 'idle' })
    })

    it('sets a value of 0 (does not treat it as undefined)', () => {
      // Given
      getSingleMetricMock.mockReturnValueOnce(gaugeMock())
      const metric = new ConcreteGaugeMetric(client)
      labelsMock.mockClear()
      setMock.mockClear()

      // When
      metric.registerMeasurement({ active: 0 })

      // Then
      expect(labelsMock).toHaveBeenCalledWith({ status: 'active' })
      expect(setMock).toHaveBeenCalledTimes(1)
      expect(setMock).toHaveBeenCalledWith(0)
    })

    it('should ignore measurements if client is not provided', () => {
      // Given
      const metric = new ConcreteGaugeMetric()

      // When
      metric.registerMeasurement({ active: 20 })

      // Then
      expect(labelsMock).not.toHaveBeenCalled()
      expect(setMock).not.toHaveBeenCalled()
    })

    it('skips keys with undefined value', () => {
      // Given
      getSingleMetricMock.mockReturnValueOnce(gaugeMock())
      const metric = new ConcreteGaugeMetric(client)
      labelsMock.mockClear()
      setMock.mockClear()

      // When
      metric.registerMeasurement({ active: 20, idle: undefined })

      // Then
      expect(labelsMock).toHaveBeenCalledTimes(1)
      expect(labelsMock).toHaveBeenCalledWith({ status: 'active' })
      expect(labelsMock).not.toHaveBeenCalledWith({ status: 'idle' })
      expect(setMock).toHaveBeenCalledTimes(1)
      expect(setMock).toHaveBeenCalledWith(20)
    })
  })
})
