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

  it('returns early when dimension is not registered', () => {
    // Given
    getSingleMetricMock.mockReturnValue(undefined)
    const metric = new ConcreteDimensionalHistogramMetric(client)

    // When
    metric.registerMeasurement({ dimension: 'unknown' as 'successful', time: 100 })

    // Then
    expect(observeMock).not.toHaveBeenCalled()
  })
})
