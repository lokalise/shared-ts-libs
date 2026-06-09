import type promClient from 'prom-client'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { AbstractMultiLabeledCounterMetric } from './AbstractMultiLabeledCounterMetric.ts'

class CounterMetric extends AbstractMultiLabeledCounterMetric<['label1', 'label2']> {
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

describe('AbstractMultiLabeledCounterMetric', () => {
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
      register: {
        getSingleMetric: getSingleMetricMock,
      },
    } as any as typeof promClient
  })

  it('gracefully aborts if metrics are not enabled', () => {
    // Given
    const metric = new CounterMetric(undefined)

    // When
    metric.registerMeasurement({ label1: 'value1', label2: 'value2', increment: 1 })

    // Then
    expect(incMock).not.toHaveBeenCalled()
  })

  it('initializes correctly the metric and registers measurements', () => {
    // Given
    getSingleMetricMock.mockReturnValueOnce(undefined)

    // When
    const metric = new CounterMetric(client)
    metric.registerMeasurement({ label1: 'value1', label2: 'value2', increment: 1 })

    // Then
    expect(getSingleMetricMock).toHaveBeenCalledWith('dummy_metric_name')
    expect(counterMock).toHaveBeenCalledWith({
      name: 'dummy_metric_name',
      help: 'My new metric',
      labelNames: ['label1', 'label2'],
    })
    expect(incMock).toHaveBeenCalledWith({ label1: 'value1', label2: 'value2' }, 1)
  })

  it('uses the provided increment value and accepts numeric label values', () => {
    // Given
    getSingleMetricMock.mockReturnValueOnce(undefined)

    // When
    const metric = new CounterMetric(client)
    metric.registerMeasurement({ label1: 'value1', label2: 42, increment: 5 })

    // Then
    expect(incMock).toHaveBeenCalledWith({ label1: 'value1', label2: 42 }, 5)
  })

  it('should use existing metric and register measurements', () => {
    // Given
    getSingleMetricMock.mockReturnValueOnce({ inc: incMock })

    // When
    const metric = new CounterMetric(client)
    metric.registerMeasurement({ label1: 'value1', label2: 'value2', increment: 1 })

    // Then
    expect(getSingleMetricMock).toHaveBeenCalledWith('dummy_metric_name')
    expect(counterMock).not.toHaveBeenCalled()
    expect(incMock).toHaveBeenCalledWith({ label1: 'value1', label2: 'value2' }, 1)
  })

  it('should ignore measurements if client is not provided', () => {
    // Given
    const metric = new CounterMetric()

    // When
    metric.registerMeasurement({ label1: 'value1', label2: 'value2', increment: 1 })

    // Then
    expect(incMock).not.toHaveBeenCalled()
  })
})
