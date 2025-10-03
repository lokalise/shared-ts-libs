type PromiseWithTimeoutResult<T> = { finished: false } | { finished: true; result: Error | T }

/**
 * Races a promise against a timeout, returning the result if the promise completes within the timeout period.
 * Returns an object indicating whether the promise finished, and if so, includes the result or error.
 *
 * @template T - The type of the value the promise resolves to.
 * @param {Promise<T>} promise - The promise to race against the timeout.
 * @param {number} [timeout=1000] - The timeout in milliseconds to wait before considering the promise unfinished.
 * @returns {Promise<PromiseWithTimeoutResult<T>>} A promise that resolves to `{ finished: false }` if the timeout occurred, or `{ finished: true, result: T | Error }` if the promise completed.
 *
 * @example
 * ```typescript
 * const slowPromise = new Promise((resolve) => setTimeout(() => resolve('done'), 2000))
 * const result = await promiseWithTimeout(slowPromise, 1000)
 * console.log(result) // { finished: false } (promise takes 2s, timeout is 1s)
 *
 * const fastPromise = Promise.resolve('done')
 * const result2 = await promiseWithTimeout(fastPromise, 1000)
 * console.log(result2) // { finished: true, result: 'done' }
 *
 * const failedPromise = Promise.reject(new Error('failed'))
 * const result3 = await promiseWithTimeout(failedPromise, 1000)
 * console.log(result3) // { finished: true, result: Error('failed') }
 * ```
 */
export const promiseWithTimeout = <T>(
  promise: Promise<T>,
  timeout: number = 1000,
): Promise<PromiseWithTimeoutResult<T>> =>
  Promise.race<PromiseWithTimeoutResult<T>>([
    new Promise<PromiseWithTimeoutResult<T>>((done) =>
      setTimeout(() => done({ finished: false }), timeout),
    ),
    promise
      .then((result) => ({
        finished: true,
        result,
      }))
      .catch((error) => ({
        finished: true,
        result: error,
      })),
  ])
