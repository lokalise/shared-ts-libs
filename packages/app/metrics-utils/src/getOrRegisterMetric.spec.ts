import type promClient from 'prom-client'
import type { Metric } from 'prom-client'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { getOrRegisterMetric } from './getOrRegisterMetric.ts'

describe('getOrRegisterMetric', () => {
  let getSingleMetricMock: Mock
  let client: typeof promClient

  beforeEach(() => {
    getSingleMetricMock = vi.fn()
    client = {
      register: { getSingleMetric: getSingleMetricMock },
    } as any as typeof promClient
  })

  it('returns the existing metric without invoking the factory when already registered', () => {
    // Given
    const existing = { kind: 'existing' } as unknown as Metric
    getSingleMetricMock.mockReturnValue(existing)
    const factory = vi.fn()

    // When
    const result = getOrRegisterMetric(client, 'my_metric', factory)

    // Then
    expect(getSingleMetricMock).toHaveBeenCalledWith('my_metric')
    expect(factory).not.toHaveBeenCalled()
    expect(result).toBe(existing)
  })

  it('invokes the factory and returns its result when the metric is not registered', () => {
    // Given
    getSingleMetricMock.mockReturnValue(undefined)
    const created = { kind: 'created' } as unknown as Metric
    const factory = vi.fn().mockReturnValue(created)

    // When
    const result = getOrRegisterMetric(client, 'my_metric', factory)

    // Then
    expect(getSingleMetricMock).toHaveBeenCalledWith('my_metric')
    expect(factory).toHaveBeenCalledTimes(1)
    expect(result).toBe(created)
  })
})
