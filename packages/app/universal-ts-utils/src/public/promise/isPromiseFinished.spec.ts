import { describe, expect, it } from 'vitest'
import { isPromiseFinished } from './isPromiseFinished.ts'

describe('isPromiseFinished', () => {
  it('returns true for an already resolved promise', async () => {
    const promise = Promise.resolve('done')
    const result = await isPromiseFinished(promise, 1000)
    expect(result).toBe(true)
  })

  it('returns true for an already rejected promise', async () => {
    const promise = Promise.reject(new Error('failed'))
    const result = await isPromiseFinished(promise, 1000)
    expect(result).toBe(true)
  })

  it('returns false when promise takes longer than timeout', async () => {
    const slowPromise = new Promise((resolve) => setTimeout(() => resolve('done'), 2000))
    const result = await isPromiseFinished(slowPromise, 500)
    expect(result).toBe(false)
  })

  it('returns true when promise resolves before timeout', async () => {
    const fastPromise = new Promise((resolve) => setTimeout(() => resolve('done'), 100))
    const result = await isPromiseFinished(fastPromise, 500)
    expect(result).toBe(true)
  })

  it('returns true when promise rejects before timeout', async () => {
    const fastReject = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('error')), 100),
    )
    const result = await isPromiseFinished(fastReject, 500)
    expect(result).toBe(true)
  })

  it('uses default timeout of 1000ms when not specified', async () => {
    const slowPromise = new Promise((resolve) => setTimeout(() => resolve('done'), 1500))
    const result = await isPromiseFinished(slowPromise)
    expect(result).toBe(false)
  })

  it('handles a promise that resolves within default timeout', async () => {
    const fastPromise = new Promise((resolve) => setTimeout(() => resolve('done'), 500))
    const result = await isPromiseFinished(fastPromise)
    expect(result).toBe(true)
  })
})