import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { delay } from './delay.ts'

describe('delay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('basic delay behavior', () => {
    it('should delay for the specified milliseconds', async () => {
      const promise = delay(1000)

      expect(promise).toBeInstanceOf(Promise)

      // Fast-forward time
      await vi.advanceTimersByTimeAsync(1000)

      await expect(promise).resolves.toBeUndefined()
    })

    it('should delay for zero milliseconds', async () => {
      const promise = delay(0)

      await vi.advanceTimersByTimeAsync(0)

      await expect(promise).resolves.toBeUndefined()
    })

    it('should handle multiple concurrent delays', async () => {
      const promise1 = delay(500)
      const promise2 = delay(1000)
      const promise3 = delay(1500)

      // After 500ms, only first should resolve
      await vi.advanceTimersByTimeAsync(500)
      await expect(promise1).resolves.toBeUndefined()

      // After 1000ms total, second should resolve
      await vi.advanceTimersByTimeAsync(500)
      await expect(promise2).resolves.toBeUndefined()

      // After 1500ms total, third should resolve
      await vi.advanceTimersByTimeAsync(500)
      await expect(promise3).resolves.toBeUndefined()
    })
  })

  describe('AbortSignal support', () => {
    it('should reject when signal is aborted during delay', async () => {
      const controller = new AbortController()
      const promise = delay(1000, controller.signal)

      // Abort after 500ms
      await vi.advanceTimersByTimeAsync(500)
      controller.abort()

      await expect(promise).rejects.toThrow('Delay was aborted')
    })

    it('should reject immediately if signal is already aborted', async () => {
      const controller = new AbortController()
      controller.abort() // Abort before calling delay

      const promise = delay(1000, controller.signal)

      await expect(promise).rejects.toThrow('Delay was aborted')
    })

    it('should resolve normally if not aborted', async () => {
      const controller = new AbortController()
      const promise = delay(1000, controller.signal)

      await vi.advanceTimersByTimeAsync(1000)

      await expect(promise).resolves.toBeUndefined()
    })

    it('should work without signal parameter', async () => {
      const promise = delay(500)

      await vi.advanceTimersByTimeAsync(500)

      await expect(promise).resolves.toBeUndefined()
    })

    it('should clean up abort listener when delay completes', async () => {
      const controller = new AbortController()
      const removeEventListenerSpy = vi.spyOn(controller.signal, 'removeEventListener')

      const promise = delay(500, controller.signal)

      await vi.advanceTimersByTimeAsync(500)
      await promise

      // Verify cleanup - removeEventListener should be called to clean up the listener
      expect(removeEventListenerSpy).toHaveBeenCalledTimes(1)
      expect(removeEventListenerSpy).toHaveBeenCalledWith('abort', expect.any(Function))
    })

    it('should clear timeout when aborted', async () => {
      const controller = new AbortController()
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')

      const promise = delay(1000, controller.signal)

      await vi.advanceTimersByTimeAsync(100)
      controller.abort()

      await expect(promise).rejects.toThrow('Delay was aborted')
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1)
    })

    it('should handle multiple delays with same signal', async () => {
      const controller = new AbortController()

      const promise1 = delay(500, controller.signal)
      const promise2 = delay(1000, controller.signal)
      const promise3 = delay(1500, controller.signal)

      // Abort after 250ms
      await vi.advanceTimersByTimeAsync(250)
      controller.abort()

      await expect(promise1).rejects.toThrow('Delay was aborted')
      await expect(promise2).rejects.toThrow('Delay was aborted')
      await expect(promise3).rejects.toThrow('Delay was aborted')
    })
  })

  describe('edge cases', () => {
    it('should handle very short delays', async () => {
      const promise = delay(1)

      await vi.advanceTimersByTimeAsync(1)

      await expect(promise).resolves.toBeUndefined()
    })

    it('should handle very long delays', async () => {
      const promise = delay(1000000)

      await vi.advanceTimersByTimeAsync(1000000)

      await expect(promise).resolves.toBeUndefined()
    })

    it('should not resolve early', async () => {
      const promise = delay(1000)
      let resolved = false

      promise.then(() => {
        resolved = true
      })

      await vi.advanceTimersByTimeAsync(999)
      expect(resolved).toBe(false)

      await vi.advanceTimersByTimeAsync(1)
      await promise
      expect(resolved).toBe(true)
    })

    it('should handle abort after delay completes', async () => {
      const controller = new AbortController()
      const promise = delay(500, controller.signal)

      await vi.advanceTimersByTimeAsync(500)
      await promise

      // Aborting after completion should not affect the resolved promise
      expect(() => controller.abort()).not.toThrow()
    })
  })

  describe('error handling', () => {
    it('should reject with Error instance', async () => {
      const controller = new AbortController()
      const promise = delay(1000, controller.signal)

      controller.abort()

      try {
        await promise
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('Delay was aborted')
        expect((error as Error).name).toBe('AbortError')
      }
    })

    it('should allow catching abort errors', async () => {
      const controller = new AbortController()
      let errorCaught = false

      const promise = delay(1000, controller.signal).catch((error) => {
        errorCaught = true
        expect(error).toBeInstanceOf(Error)
      })

      controller.abort()

      await promise
      expect(errorCaught).toBe(true)
    })

    it('should reject with TypeError for invalid input', async () => {
      await expect(delay(-1)).rejects.toThrow(TypeError)
      await expect(delay(-1)).rejects.toThrow('delay time must be a non-negative finite number')
      await expect(delay(Number.POSITIVE_INFINITY)).rejects.toThrow(TypeError)
      await expect(delay(NaN)).rejects.toThrow(TypeError)
    })
  })

  describe('real-time behavior', () => {
    beforeEach(() => {
      vi.useRealTimers()
    })

    it('should work with real timers for short delays', async () => {
      const start = Date.now()
      await delay(50)
      const elapsed = Date.now() - start

      // Allow some variance for real-world timing
      expect(elapsed).toBeGreaterThanOrEqual(40)
      expect(elapsed).toBeLessThan(100)
    })

    it('should work with real abort signal', async () => {
      const controller = new AbortController()

      const promise = delay(1000, controller.signal)

      // Abort after a short delay
      setTimeout(() => controller.abort(), 50)

      await expect(promise).rejects.toThrow('Delay was aborted')
    })

    it('should handle abort with real timers', async () => {
      // Test abort behavior with real event loop timing

      // Use real timers to ensure actual event loop behavior
      vi.useRealTimers()

      try {
        const controller = new AbortController()

        // Start delay with signal
        const promise = delay(50, controller.signal)

        // Abort after a tiny delay to ensure abort handler is called
        await new Promise((resolve) => setTimeout(resolve, 5))
        controller.abort()

        await expect(promise).rejects.toThrow('Delay was aborted')
      } finally {
        vi.useFakeTimers()
      }
    })

    it('should handle multiple simultaneous abort calls', async () => {
      // Another edge case: abort called multiple times rapidly
      const controller = new AbortController()

      const promise = delay(100, controller.signal)

      // Abort multiple times rapidly
      controller.abort()
      controller.abort()
      controller.abort()

      await expect(promise).rejects.toThrow('Delay was aborted')
    })
  })
})
