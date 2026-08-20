import type { TransactionObservabilityManager } from '@lokalise/node-core'
import { describe, expect, it, vi } from 'vitest'
import { runInTransactionContext } from './transactionContext.ts'

describe('runInTransactionContext', () => {
  const buildManager = () => ({
    start: vi.fn(),
    startWithGroup: vi.fn(),
    stop: vi.fn(),
    addCustomAttributes: vi.fn(),
  })

  it('executes the function when there is no manager', () => {
    expect(runInTransactionContext(undefined, 'key', () => 'result')).toBe('result')
  })

  it('executes the function when the manager cannot propagate context', () => {
    const manager = buildManager()

    expect(runInTransactionContext(manager, 'key', () => 'result')).toBe('result')
  })

  it('delegates to the manager when it can propagate context', () => {
    const runInSpanContext = vi.fn((_key: string, fn: () => unknown) => fn())
    const manager = { ...buildManager(), runInSpanContext } as TransactionObservabilityManager

    expect(runInTransactionContext(manager, 'key', () => 'result')).toBe('result')
    expect(runInSpanContext).toHaveBeenCalledWith('key', expect.any(Function))
  })

  it('propagates the value returned by the manager', () => {
    const manager = {
      ...buildManager(),
      runInSpanContext: () => 'from-manager',
    } as TransactionObservabilityManager

    expect(runInTransactionContext(manager, 'key', () => 'result')).toBe('from-manager')
  })
})
