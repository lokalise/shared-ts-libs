import { describe, expect, it } from 'vitest'
import { promiseWithTimeout } from './promiseWithTimeout.ts'

describe('promiseWithTimeout', () => {
  it('returns finished: true with result for an already resolved promise', async () => {
    const promise = Promise.resolve('done')
    const result = await promiseWithTimeout(promise, 1000)
    expect(result).toEqual({ finished: true, result: 'done' })
  })

  it('returns finished: true with error for an already rejected promise', async () => {
    const error = new Error('failed')
    const promise = Promise.reject(error)
    const result = await promiseWithTimeout(promise, 1000)
    expect(result).toEqual({ finished: true, result: error })
  })

  it('returns finished: false when promise takes longer than timeout', async () => {
    const slowPromise = new Promise((resolve) => setTimeout(() => resolve('done'), 2000))
    const result = await promiseWithTimeout(slowPromise, 500)
    expect(result).toEqual({ finished: false })
  })

  it('returns finished: true with result when promise resolves before timeout', async () => {
    const fastPromise = new Promise((resolve) => setTimeout(() => resolve('done'), 100))
    const result = await promiseWithTimeout(fastPromise, 500)
    expect(result).toEqual({ finished: true, result: 'done' })
  })

  it('returns finished: true with error when promise rejects before timeout', async () => {
    const error = new Error('error')
    const fastReject = new Promise((_, reject) => setTimeout(() => reject(error), 100))
    const result = await promiseWithTimeout(fastReject, 500)
    expect(result).toEqual({ finished: true, result: error })
  })

  it('uses default timeout of 1000ms when not specified', async () => {
    const slowPromise = new Promise((resolve) => setTimeout(() => resolve('done'), 1500))
    const result = await promiseWithTimeout(slowPromise)
    expect(result).toEqual({ finished: false })
  })

  it('handles a promise that resolves within default timeout', async () => {
    const fastPromise = new Promise((resolve) => setTimeout(() => resolve('done'), 500))
    const result = await promiseWithTimeout(fastPromise)
    expect(result).toEqual({ finished: true, result: 'done' })
  })

  it('preserves the type of resolved values', async () => {
    const numberPromise = Promise.resolve(42)
    const result = await promiseWithTimeout(numberPromise, 1000)
    if (result.finished) {
      expect(result.result).toBe(42)
    }
  })

  it('preserves the type of complex resolved values', async () => {
    const objectPromise = Promise.resolve({ id: 1, name: 'test' })
    const result = await promiseWithTimeout(objectPromise, 1000)
    if (result.finished) {
      expect(result.result).toEqual({ id: 1, name: 'test' })
    }
  })
})
