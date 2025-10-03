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
 * memory leaks.
 *
 * @param promise - The promise to wrap with a timeout
 * @param timeout - Timeout in milliseconds
 * @param opts - Optional configuration
 * @returns A promise that always resolves with a TimeoutResult
 *
 * @example
 * // Basic usage
 * const result = await promiseWithTimeout(fetchData(), 5000);
 * if (!result.finished) {
 *   console.log('Timed out');
 * } else if (result.ok) {
 *   console.log('Success:', result.result);
 * } else {
 *   console.log('Error:', result.error);
 * }
 *
 * @example
 * // With abort on timeout
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
    let settled = false

    const settle = (result: PromiseWithTimeoutResult<T>) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    const timer = setTimeout(() => {
      if (opts?.abortController && !opts.abortController.signal.aborted) {
        opts.abortController.abort()
      }
      settle({ finished: false })
    }, timeout)

    // Listen for external abort
    opts?.abortController?.signal.addEventListener(
      'abort',
      () => {
        settle({ finished: false })
      },
      { once: true },
    )

    promise.then(
      (value) => settle({ finished: true, result: value }),
      (error) => settle({ finished: true, result: error }),
    )
  })
}
