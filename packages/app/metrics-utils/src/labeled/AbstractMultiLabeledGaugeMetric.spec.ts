import type promClient from 'prom-client'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { AbstractMultiLabeledGaugeMetric } from './AbstractMultiLabeledGaugeMetric.ts'

class GaugeMetric extends AbstractMultiLabeledGaugeMetric<['label1', 'label2']> {
  constructor(client?: typeof promClient) {
    super(
      {
        name: 'dummy_metric_name',
        helpDescription: 'My new metric',
        labelNames: ['label1', 'label2'],
      },
      client,
    )
  }
}

describe('AbstractMultiLabeledGaugeMetric', () => {
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
      register: {
        getSingleMetric: getSingleMetricMock,
      },
    } as any as typeof promClient
  })

  it('gracefully aborts if metrics are not enabled', () => {
    // Given
    const metric = new GaugeMetric(undefined)

    // When
    metric.registerMeasurement({ label1: 'value1', label2: 'value2', value: 1 })

    // Then
    expect(setMock).not.toHaveBeenCalled()
  })

  it('initializes correctly the metric and registers measurements', () => {
    // Given
    getSingleMetricMock.mockReturnValueOnce(undefined)

    // When
    const metric = new GaugeMetric(client)
    metric.registerMeasurement({ label1: 'value1', label2: 'value2', value: 42 })

    // Then
    expect(getSingleMetricMock).toHaveBeenCalledWith('dummy_metric_name')
    expect(gaugeMock).toHaveBeenCalledWith({
      name: 'dummy_metric_name',
      help: 'My new metric',
      labelNames: ['label1', 'label2'],
    })
    expect(setMock).toHaveBeenCalledWith({ label1: 'value1', label2: 'value2' }, 42)
  })

  it('accepts numeric label values', () => {
    // Given
    getSingleMetricMock.mockReturnValueOnce(undefined)

    // When
    const metric = new GaugeMetric(client)
    metric.registerMeasurement({ label1: 'value1', label2: 42, value: 5 })

    // Then
    expect(setMock).toHaveBeenCalledWith({ label1: 'value1', label2: 42 }, 5)
  })

  it('sets a value of 0', () => {
    // Given
    getSingleMetricMock.mockReturnValueOnce(undefined)

    // When
    const metric = new GaugeMetric(client)
    metric.registerMeasurement({ label1: 'value1', label2: 'value2', value: 0 })

    // Then
    expect(setMock).toHaveBeenCalledWith({ label1: 'value1', label2: 'value2' }, 0)
  })

  it('should use existing metric and register measurements', () => {
    // Given
    getSingleMetricMock.mockReturnValueOnce({ set: setMock })

    // When
    const metric = new GaugeMetric(client)
    metric.registerMeasurement({ label1: 'value1', label2: 'value2', value: 1 })

    // Then
    expect(getSingleMetricMock).toHaveBeenCalledWith('dummy_metric_name')
    expect(gaugeMock).not.toHaveBeenCalled()
    expect(setMock).toHaveBeenCalledWith({ label1: 'value1', label2: 'value2' }, 1)
  })

  it('should ignore measurements if client is not provided', () => {
    // Given
    const metric = new GaugeMetric()

    // When
    metric.registerMeasurement({ label1: 'value1', label2: 'value2', value: 1 })

    // Then
    expect(setMock).not.toHaveBeenCalled()
  })
})
