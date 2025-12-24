import type promClient from 'prom-client'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { AbstractHistogramMetric } from './AbstractHistogramMetric.ts'

class HistogramMetric extends AbstractHistogramMetric<['label1', 'label2']> {
  constructor(client?: typeof promClient) {
    super(
      {
        name: 'dummy_metric_name',
        helpDescription: 'My new metric',
        labelNames: ['label1', 'label2'],
        buckets: [1, 2, 3],
      },
      client,
    )
  }
}

describe('AbstractHistogramMetric', () => {
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
      register: {
        getSingleMetric: getSingleMetricMock,
      },
    } as any as typeof promClient
  })

  it('gracefully aborts if metrics are not enabled', () => {
    // Given
    const metric = new HistogramMetric(undefined)

    // When
    metric.registerMeasurement({ label1: 'value1', label2: 'value2', time: 100 })

    // Then
    expect(observeMock).not.toHaveBeenCalled()
  })

  it('initializes correctly the metric and register measurements', () => {
    // Given
    getSingleMetricMock.mockReturnValueOnce(undefined)

    // When
    const metric = new HistogramMetric(client)
    metric.registerMeasurement({ label1: 'value1', label2: 'value2', time: 100 })

    // Then
    expect(getSingleMetricMock).toHaveBeenCalledWith('dummy_metric_name')
    expect(histogramMock).toHaveBeenCalledWith({
      name: 'dummy_metric_name',
      help: 'My new metric',
      labelNames: ['label1', 'label2'],
      buckets: [1, 2, 3],
    })
    expect(observeMock).toHaveBeenCalledWith({ label1: 'value1', label2: 'value2' }, 100)
  })

  it('should use existing metric and register measurements', () => {
    // Given
    getSingleMetricMock.mockReturnValueOnce({ observe: observeMock })

    // When
    const metric = new HistogramMetric(client)
    metric.registerMeasurement({ label1: 'value1', label2: 'value2', startTime: 100, endTime: 150 })

    // Then
    expect(getSingleMetricMock).toHaveBeenCalledWith('dummy_metric_name')
    expect(histogramMock).not.toHaveBeenCalled()
    expect(observeMock).toHaveBeenCalledWith({ label1: 'value1', label2: 'value2' }, 50)
  })

  it('should ignore measurements if client is not provided', () => {
    // Given
    const metric = new HistogramMetric()

    // When
    metric.registerMeasurement({ label1: 'value1', label2: 'value2', time: 100 })

    // Then
    expect(observeMock).not.toHaveBeenCalled()
  })
})
