import type { IFastifyMetrics } from 'fastify-metrics'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { AbstractCounterMetric } from './AbstractCounterMetric.ts'

class ConcreteCounterMetric extends AbstractCounterMetric<'status', ['successful', 'failed']> {
  constructor(appMetrics?: IFastifyMetrics) {
    super(
      {
        name: 'dummy_metric_name',
        helpDescription: 'Number of dummies per status',
        label: 'status',
        measurementKeys: ['successful', 'failed'],
      },
      appMetrics,
    )
  }
}

describe('AbstractCounterMetric', () => {
  let incMock: Mock
  let labelsMock: Mock
  let counterMock: Mock
  let getSingleMetricMock: Mock
  let appMetrics: IFastifyMetrics

  beforeEach(() => {
    incMock = vi.fn()
    labelsMock = vi.fn().mockImplementation(() => ({ inc: incMock }))
    counterMock = vi.fn().mockImplementation(() => ({ labels: labelsMock }))
    getSingleMetricMock = vi.fn()
    appMetrics = {
      client: {
        Counter: counterMock,
        register: {
          getSingleMetric: getSingleMetricMock,
        },
      },
    } as unknown as IFastifyMetrics
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('registerMeasurement', () => {
    it('gracefully aborts if metrics are not enabled', () => {
      // Given
      const metric = new ConcreteCounterMetric(undefined)

      // When
      metric.registerMeasurement({ successful: 20, failed: 10 })

      // Then
      expect(labelsMock).not.toHaveBeenCalled()
      expect(incMock).not.toHaveBeenCalled()
    })

    it('initializes correctly with 0 values for all measurements', () => {
      // Given
      getSingleMetricMock.mockReturnValueOnce(undefined)

      // When
      new ConcreteCounterMetric(appMetrics)

      // Then
      expect(getSingleMetricMock).toHaveBeenCalledWith('dummy_metric_name')
      expect(counterMock).toHaveBeenCalledWith({
        name: 'dummy_metric_name',
        help: 'Number of dummies per status',
        labelNames: ['status'],
      })
      expect(labelsMock).toHaveBeenCalledWith({ status: 'successful' })
      expect(incMock).toHaveBeenNthCalledWith(1, 0)
      expect(labelsMock).toHaveBeenCalledWith({ status: 'failed' })
      expect(incMock).toHaveBeenNthCalledWith(2, 0)
    })

    it('registers all measurements properly', () => {
      // Given
      getSingleMetricMock.mockReturnValueOnce(counterMock())
      const metric = new ConcreteCounterMetric(appMetrics)

      // When
      metric.registerMeasurement({ successful: 20, failed: 10 })

      // Then
      expect(labelsMock).toHaveBeenCalledWith({ status: 'successful' })
      expect(incMock).toHaveBeenNthCalledWith(1, 20)
      expect(labelsMock).toHaveBeenCalledWith({ status: 'failed' })
      expect(incMock).toHaveBeenNthCalledWith(2, 10)
    })

    it('registers selected measurements properly', () => {
      // Given
      getSingleMetricMock.mockReturnValueOnce(counterMock())
      const metric = new ConcreteCounterMetric(appMetrics)

      // When
      metric.registerMeasurement({ successful: 20 })

      // Then
      expect(labelsMock).toHaveBeenCalledWith({ status: 'successful' })
      expect(incMock).toHaveBeenNthCalledWith(1, 20)
      expect(incMock).toHaveBeenCalledTimes(1)
      expect(labelsMock).not.toHaveBeenCalledWith({ status: 'failed' })
    })
  })
})
