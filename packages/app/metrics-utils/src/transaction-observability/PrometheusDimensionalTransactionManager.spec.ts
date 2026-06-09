import type promClient from 'prom-client'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { PrometheusDimensionalTransactionManager } from './PrometheusDimensionalTransactionManager.ts'

describe('PrometheusDimensionalTransactionManager', () => {
  let incMock: Mock
  let observeMock: Mock
  let counterMock: Mock
  let histogramMock: Mock
  let getSingleMetricMock: Mock
  let client: typeof promClient

  beforeEach(() => {
    incMock = vi.fn()
    observeMock = vi.fn()
    // biome-ignore lint/complexity/useArrowFunction: required for vitest
    counterMock = vi.fn().mockImplementation(function () {
      return { inc: incMock }
    })
    // biome-ignore lint/complexity/useArrowFunction: required for vitest
    histogramMock = vi.fn().mockImplementation(function () {
      return { observe: observeMock }
    })
    getSingleMetricMock = vi.fn().mockReturnValue(undefined)
    client = {
      Counter: counterMock,
      Histogram: histogramMock,
      register: { getSingleMetric: getSingleMetricMock },
    } as any as typeof promClient
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('counter mode', () => {
    it('creates a label-free counter for a (transactionName, status) combo on first stop()', () => {
      const manager = new PrometheusDimensionalTransactionManager(
        {
          type: 'counter',
          helpDescription: 'desc',
          buildMetricName: (name, status) => `foo_${name}_${status}:counter`,
        },
        client,
      )

      manager.start('queue_consumer', 'key-1')
      manager.stop('key-1', true)

      expect(counterMock).toHaveBeenCalledWith({
        name: 'foo_queue_consumer_success:counter',
        help: 'desc',
        labelNames: [],
      })
      expect(incMock).toHaveBeenCalledWith(1)
    })

    it('emits status=error when wasSuccessful is false', () => {
      const manager = new PrometheusDimensionalTransactionManager(
        {
          type: 'counter',
          helpDescription: 'desc',
          buildMetricName: (name, status) => `foo_${name}_${status}:counter`,
        },
        client,
      )

      manager.start('queue_consumer', 'key-1')
      manager.stop('key-1', false)

      expect(counterMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'foo_queue_consumer_error:counter' }),
      )
    })

    it('reuses the same metric instance across multiple stops for the same combo', () => {
      const manager = new PrometheusDimensionalTransactionManager(
        {
          type: 'counter',
          helpDescription: 'desc',
          buildMetricName: (name, status) => `foo_${name}_${status}:counter`,
        },
        client,
      )

      manager.start('queue_consumer', 'key-1')
      manager.stop('key-1', true)
      manager.start('queue_consumer', 'key-2')
      manager.stop('key-2', true)

      expect(counterMock).toHaveBeenCalledTimes(1)
    })

    it('creates a separate metric per distinct (transactionName, status) combo', () => {
      const manager = new PrometheusDimensionalTransactionManager(
        {
          type: 'counter',
          helpDescription: 'desc',
          buildMetricName: (name, status) => `foo_${name}_${status}:counter`,
        },
        client,
      )

      manager.start('queue_a', 'key-1')
      manager.stop('key-1', true)
      manager.start('queue_a', 'key-2')
      manager.stop('key-2', false)
      manager.start('queue_b', 'key-3')
      manager.stop('key-3', true)

      expect(counterMock).toHaveBeenCalledTimes(3)
      const createdNames = counterMock.mock.calls.map((c) => c[0].name)
      expect(createdNames).toEqual([
        'foo_queue_a_success:counter',
        'foo_queue_a_error:counter',
        'foo_queue_b_success:counter',
      ])
    })

    it('does nothing on stop() if start() was never called for the key', () => {
      const manager = new PrometheusDimensionalTransactionManager(
        {
          type: 'counter',
          helpDescription: 'desc',
          buildMetricName: (name, status) => `foo_${name}_${status}:counter`,
        },
        client,
      )

      manager.stop('unknown', true)

      expect(counterMock).not.toHaveBeenCalled()
      expect(incMock).not.toHaveBeenCalled()
    })
  })

  describe('histogram mode', () => {
    it('creates a label-free histogram and observes the duration on stop()', () => {
      vi.setSystemTime(new Date('2026-04-24T10:00:00Z'))
      const manager = new PrometheusDimensionalTransactionManager(
        {
          type: 'histogram',
          helpDescription: 'desc',
          buckets: [100, 500, 1000],
          buildMetricName: (name, status) => `foo_${name}_${status}:histogram`,
        },
        client,
      )

      manager.start('queue_consumer', 'key-1')
      vi.advanceTimersByTime(250)
      manager.stop('key-1', true)

      expect(histogramMock).toHaveBeenCalledWith({
        name: 'foo_queue_consumer_success:histogram',
        help: 'desc',
        buckets: [100, 500, 1000],
        labelNames: [],
      })
      expect(observeMock).toHaveBeenCalledWith({}, 250)
    })

    it('emits status=error with the duration when wasSuccessful is false', () => {
      vi.setSystemTime(new Date('2026-04-24T10:00:00Z'))
      const manager = new PrometheusDimensionalTransactionManager(
        {
          type: 'histogram',
          helpDescription: 'desc',
          buckets: [100, 500, 1000],
          buildMetricName: (name, status) => `foo_${name}_${status}:histogram`,
        },
        client,
      )

      manager.start('queue_consumer', 'key-1')
      vi.advanceTimersByTime(1500)
      manager.stop('key-1', false)

      expect(histogramMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'foo_queue_consumer_error:histogram' }),
      )
      expect(observeMock).toHaveBeenCalledWith({}, 1500)
    })
  })

  describe('addCustomAttributes', () => {
    it('does not leak attributes into the emitted measurement', () => {
      const manager = new PrometheusDimensionalTransactionManager(
        {
          type: 'counter',
          helpDescription: 'desc',
          buildMetricName: (name, status) => `foo_${name}_${status}:counter`,
        },
        client,
      )

      manager.start('queue_consumer', 'key-1')
      manager.addCustomAttributes('key-1', { tenant_id: 'tenant-42', is_premium: true })
      manager.stop('key-1', true)

      expect(counterMock).toHaveBeenCalledTimes(1)
      expect(incMock).toHaveBeenLastCalledWith(1)
    })
  })

  describe('without a prom client', () => {
    it('start / stop / addCustomAttributes are no-ops', () => {
      const manager = new PrometheusDimensionalTransactionManager({
        type: 'counter',
        helpDescription: 'desc',
        buildMetricName: (name, status) => `foo_${name}_${status}:counter`,
      })

      manager.start('queue_consumer', 'key-1')
      manager.addCustomAttributes('key-1', { foo: 'bar' })
      manager.stop('key-1', true)

      expect(counterMock).not.toHaveBeenCalled()
      expect(incMock).not.toHaveBeenCalled()
    })
  })
})
