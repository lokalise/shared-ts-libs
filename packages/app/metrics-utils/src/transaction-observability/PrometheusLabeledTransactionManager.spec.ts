import type promClient from 'prom-client'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { PrometheusLabeledTransactionManager } from './PrometheusLabeledTransactionManager.ts'

describe('PrometheusLabeledTransactionManager', () => {
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
    it('creates a counter with the expected labels', () => {
      new PrometheusLabeledTransactionManager(
        { type: 'counter', name: 'tx_count', helpDescription: 'desc' },
        client,
      )

      expect(counterMock).toHaveBeenCalledWith({
        name: 'tx_count',
        help: 'desc',
        labelNames: ['status', 'transaction_name'],
      })
    })

    it('includes customLabels in labelNames when provided', () => {
      new PrometheusLabeledTransactionManager<['tenant_id', 'project_type']>(
        {
          type: 'counter',
          name: 'tx_count',
          helpDescription: 'desc',
          customLabels: ['tenant_id', 'project_type'],
        },
        client,
      )

      expect(counterMock).toHaveBeenCalledWith({
        name: 'tx_count',
        help: 'desc',
        labelNames: ['status', 'transaction_name', 'tenant_id', 'project_type'],
      })
    })

    it('increments counter with status=success on stop()', () => {
      const manager = new PrometheusLabeledTransactionManager(
        { type: 'counter', name: 'tx_count', helpDescription: 'desc' },
        client,
      )

      manager.start('queue_consumer', 'key-1')
      manager.stop('key-1', true)

      expect(incMock).toHaveBeenCalledWith(
        { status: 'success', transaction_name: 'queue_consumer' },
        1,
      )
    })

    it('increments counter with status=error on stop(wasSuccessful=false)', () => {
      const manager = new PrometheusLabeledTransactionManager(
        { type: 'counter', name: 'tx_count', helpDescription: 'desc' },
        client,
      )

      manager.start('queue_consumer', 'key-1')
      manager.stop('key-1', false)

      expect(incMock).toHaveBeenCalledWith(
        { status: 'error', transaction_name: 'queue_consumer' },
        1,
      )
    })

    it('defaults wasSuccessful to true when not provided', () => {
      const manager = new PrometheusLabeledTransactionManager(
        { type: 'counter', name: 'tx_count', helpDescription: 'desc' },
        client,
      )

      manager.start('queue_consumer', 'key-1')
      manager.stop('key-1')

      expect(incMock).toHaveBeenCalledWith(
        { status: 'success', transaction_name: 'queue_consumer' },
        1,
      )
    })

    it('does nothing on stop() if start() was never called for the key', () => {
      const manager = new PrometheusLabeledTransactionManager(
        { type: 'counter', name: 'tx_count', helpDescription: 'desc' },
        client,
      )

      manager.stop('unknown-key', true)

      expect(incMock).not.toHaveBeenCalled()
    })

    it('startWithGroup behaves like start (group is ignored for Prometheus)', () => {
      const manager = new PrometheusLabeledTransactionManager(
        { type: 'counter', name: 'tx_count', helpDescription: 'desc' },
        client,
      )

      manager.startWithGroup('queue_consumer', 'key-1', 'some-group')
      manager.stop('key-1', true)

      expect(incMock).toHaveBeenCalledWith(
        { status: 'success', transaction_name: 'queue_consumer' },
        1,
      )
    })
  })

  describe('histogram mode', () => {
    it('creates a histogram with the expected labels and buckets', () => {
      new PrometheusLabeledTransactionManager(
        {
          type: 'histogram',
          name: 'tx_duration_seconds',
          helpDescription: 'desc',
          buckets: [0.1, 0.5, 1, 5],
        },
        client,
      )

      expect(histogramMock).toHaveBeenCalledWith({
        name: 'tx_duration_seconds',
        help: 'desc',
        labelNames: ['status', 'transaction_name'],
        buckets: [0.1, 0.5, 1, 5],
      })
    })

    it('observes the measured duration on stop()', () => {
      vi.setSystemTime(new Date('2026-04-24T10:00:00Z'))
      const manager = new PrometheusLabeledTransactionManager(
        {
          type: 'histogram',
          name: 'tx_duration_seconds',
          helpDescription: 'desc',
          buckets: [0.1, 0.5, 1, 5],
        },
        client,
      )

      manager.start('queue_consumer', 'key-1')
      vi.advanceTimersByTime(1500)
      manager.stop('key-1', true)

      expect(observeMock).toHaveBeenCalledWith(
        { status: 'success', transaction_name: 'queue_consumer' },
        1500,
      )
    })

    it('observes with status=error when wasSuccessful is false', () => {
      vi.setSystemTime(new Date('2026-04-24T10:00:00Z'))
      const manager = new PrometheusLabeledTransactionManager(
        {
          type: 'histogram',
          name: 'tx_duration_seconds',
          helpDescription: 'desc',
          buckets: [0.1, 0.5, 1, 5],
        },
        client,
      )

      manager.start('queue_consumer', 'key-1')
      vi.advanceTimersByTime(250)
      manager.stop('key-1', false)

      expect(observeMock).toHaveBeenCalledWith(
        { status: 'error', transaction_name: 'queue_consumer' },
        250,
      )
    })

    it('does nothing on stop() if start() was never called for the key', () => {
      const manager = new PrometheusLabeledTransactionManager(
        {
          type: 'histogram',
          name: 'tx_duration_seconds',
          helpDescription: 'desc',
          buckets: [0.1, 0.5, 1, 5],
        },
        client,
      )

      manager.stop('unknown-key', true)

      expect(observeMock).not.toHaveBeenCalled()
    })
  })

  describe('addCustomAttributes', () => {
    it('includes declared custom attributes in the emitted labels', () => {
      const manager = new PrometheusLabeledTransactionManager<['tenant_id']>(
        {
          type: 'counter',
          name: 'tx_count',
          helpDescription: 'desc',
          customLabels: ['tenant_id'],
        },
        client,
      )

      manager.start('queue_consumer', 'key-1')
      manager.addCustomAttributes('key-1', { tenant_id: 'tenant-42' })
      manager.stop('key-1', true)

      expect(incMock).toHaveBeenCalledWith(
        { status: 'success', transaction_name: 'queue_consumer', tenant_id: 'tenant-42' },
        1,
      )
    })

    it('ignores attributes whose keys were not declared in customLabels', () => {
      const manager = new PrometheusLabeledTransactionManager<['tenant_id']>(
        {
          type: 'counter',
          name: 'tx_count',
          helpDescription: 'desc',
          customLabels: ['tenant_id'],
        },
        client,
      )

      manager.start('queue_consumer', 'key-1')
      manager.addCustomAttributes('key-1', {
        tenant_id: 'tenant-42',
        unknown_attr: 'will-be-ignored',
      })
      manager.stop('key-1', true)

      expect(incMock).toHaveBeenCalledWith(
        { status: 'success', transaction_name: 'queue_consumer', tenant_id: 'tenant-42' },
        1,
      )
    })

    it('passes numbers through as-is and coerces booleans to strings', () => {
      const manager = new PrometheusLabeledTransactionManager<['project_id', 'is_premium']>(
        {
          type: 'counter',
          name: 'tx_count',
          helpDescription: 'desc',
          customLabels: ['project_id', 'is_premium'],
        },
        client,
      )

      manager.start('queue_consumer', 'key-1')
      manager.addCustomAttributes('key-1', { project_id: 42, is_premium: true })
      manager.stop('key-1', true)

      expect(incMock).toHaveBeenCalledWith(
        {
          status: 'success',
          transaction_name: 'queue_consumer',
          project_id: 42,
          is_premium: 'true',
        },
        1,
      )
    })

    it('is a no-op if the transaction was never started', () => {
      const manager = new PrometheusLabeledTransactionManager<['tenant_id']>(
        {
          type: 'counter',
          name: 'tx_count',
          helpDescription: 'desc',
          customLabels: ['tenant_id'],
        },
        client,
      )

      manager.addCustomAttributes('unknown-key', { tenant_id: 'tenant-42' })
      manager.start('queue_consumer', 'key-1')
      manager.stop('key-1', true)

      expect(incMock).toHaveBeenCalledWith(
        { status: 'success', transaction_name: 'queue_consumer' },
        1,
      )
    })
  })

  describe('without a prom client', () => {
    it('start / stop / addCustomAttributes are no-ops', () => {
      const manager = new PrometheusLabeledTransactionManager({
        type: 'counter',
        name: 'tx_count',
        helpDescription: 'desc',
      })

      manager.start('queue_consumer', 'key-1')
      manager.addCustomAttributes('key-1', { foo: 'bar' })
      manager.stop('key-1', true)

      expect(counterMock).not.toHaveBeenCalled()
      expect(incMock).not.toHaveBeenCalled()
    })
  })

  describe('state cleanup', () => {
    it('deletes internal state after stop() so keys can be reused', () => {
      const manager = new PrometheusLabeledTransactionManager(
        { type: 'counter', name: 'tx_count', helpDescription: 'desc' },
        client,
      )

      manager.start('queue_a', 'key-1')
      manager.stop('key-1', true)

      // Second call for same key with different name should not emit (key was cleaned up)
      manager.stop('key-1', true)
      expect(incMock).toHaveBeenCalledTimes(1)

      // Key can be reused with a different transaction name
      manager.start('queue_b', 'key-1')
      manager.stop('key-1', false)

      expect(incMock).toHaveBeenLastCalledWith(
        { status: 'error', transaction_name: 'queue_b' },
        1,
      )
    })
  })
})