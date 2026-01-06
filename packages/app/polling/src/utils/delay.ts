/**
 * Universal delay function with AbortSignal support.
 *
 * This implementation works across all JavaScript runtimes:
 * - Node.js (all versions)
 * - Browsers (all modern browsers)
 * - Deno
 * - Bun
 * - React Native
 * - Any JavaScript runtime with Promise and setTimeout support
 *
 * @param ms - Milliseconds to delay (must be non-negative finite number)
 * @param signal - Optional AbortSignal to cancel the delay
 * @throws {TypeError} When ms is not a valid non-negative finite number
 * @throws {Error} AbortError when the signal is aborted during the delay
 *
 * @example
 * ```typescript
 * // Simple delay
 * await delay(1000)
 *
 * // With cancellation
 * const controller = new AbortController()
 * setTimeout(() => controller.abort(), 500)
 * try {
 *   await delay(1000, controller.signal)
 * } catch (error) {
 *   console.log('Delay was cancelled')
 * }
 * ```
 */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  // Validate input
  if (!Number.isFinite(ms) || ms < 0) {
    return Promise.reject(
      new TypeError('delay time must be a non-negative finite number'),
    )
  }

  return new Promise((resolve, reject) => {
    // Check if already aborted
    if (signal?.aborted) {
      const error = new Error('Delay was aborted')
      error.name = 'AbortError'
      reject(error)
      return
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined
    let abortHandler: (() => void) | undefined

    // Set up the delay
    timeoutId = setTimeout(() => {
      // Clean up abort listener if it exists
      if (signal && abortHandler) {
        signal.removeEventListener('abort', abortHandler)
      }
      resolve()
    }, ms)

    // Set up abort handling if signal is provided
    if (signal) {
      abortHandler = () => {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId)
        }
        const error = new Error('Delay was aborted')
        error.name = 'AbortError'
        reject(error)
      }
      signal.addEventListener('abort', abortHandler, { once: true })
    }
  })
}
