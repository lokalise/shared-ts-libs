type PromiseWithTimeoutResult<T> = { finished: false } | { finished: true; result: Error | T }

type PromiseWithTimeoutOptions = {
  /**
   * An AbortController for bidirectional cancellation:
   * - If timeout fires first: controller.abort() is called automatically
   * - If controller.abort() is called externally: timeout is cancelled immediately
   *
   * The controller's signal should be passed to the operation you want to cancel.
   *
   * @example
   * const controller = new AbortController();
   * const result = await promiseWithTimeout(
   *   fetch(url, { signal: controller.signal }),
   *   5000,
   *   { abortController: controller }
   * );
   * // If timeout fires, fetch will be aborted automatically
   * // If you call controller.abort(), the timeout is cancelled
   */
  abortController?: AbortController
}

/**
 * Wraps a promise with a timeout, returning a result object that indicates
 * whether the promise finished and whether it succeeded or failed.
 *
 * Unlike Promise.race, this properly cleans up the timeout timer to prevent
 * memory leaks. The timeout timer is automatically cleared when:
 * - The promise resolves or rejects
 * - The timeout fires
 * - An external AbortController is aborted
 *
 * @template T - The type of the promise value
 * @param promise - The promise to wrap with a timeout
 * @param timeout - Timeout in milliseconds (default: 1000)
 * @param opts - Optional configuration
 * @returns A promise that resolves with `{ finished: false }` on timeout,
 *          or `{ finished: true, result: T | Error }` when the promise settles
 *
 * @example
 * // Basic usage - check if operation completed
 * const result = await promiseWithTimeout(fetchData(), 5000);
 * if (!result.finished) {
 *   console.log('Timed out');
 * } else {
 *   console.log('Result:', result.result);
 * }
 *
 * @example
 * // With AbortController - cancel operation on timeout
 * const controller = new AbortController();
 * const result = await promiseWithTimeout(
 *   fetch(url, { signal: controller.signal }),
 *   5000,
 *   { abortController: controller }
 * );
 */
export const promiseWithTimeout = <T>(
  promise: Promise<T>,
  timeout = 1000,
  opts?: PromiseWithTimeoutOptions,
): Promise<PromiseWithTimeoutResult<T>> => {
  // Handle already-aborted controller
  if (opts?.abortController?.signal.aborted) return Promise.resolve({ finished: false })

  return new Promise<PromiseWithTimeoutResult<T>>((resolve) => {
    let settle: ReturnType<typeof createSettler<T>>

    const timer = setTimeout(() => {
      if (opts?.abortController && !opts.abortController.signal.aborted) {
        opts.abortController.abort()
      }
      settle({ finished: false })
    }, timeout)

    settle = createSettler<T>(resolve, timer)

    // Listen for external abort
    opts?.abortController?.signal.addEventListener('abort', () => settle({ finished: false }), {
      once: true,
    })

    promise.then(
      (value) => settle({ finished: true, result: value }),
      (error) => settle({ finished: true, result: error }),
    )
  })
}

/**
 * Creates a settler function that ensures a promise can only be resolved once
 * and handles cleanup of the timeout timer.
 */
const createSettler = <T>(
  resolve: (result: PromiseWithTimeoutResult<T>) => void,
  timer: NodeJS.Timeout | ReturnType<typeof setTimeout>,
) => {
  let settled = false

  return (result: PromiseWithTimeoutResult<T>) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    resolve(result)
  }
}
