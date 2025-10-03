/**
 * Checks if a promise has finished (resolved or rejected) within a specified timeout period.
 *
 * @template T - The type of the value the promise resolves to.
 * @param {Promise<T>} promise - The promise to check for completion.
 * @param {number} [timeout=1000] - The timeout in milliseconds to wait before considering the promise unfinished.
 * @returns {Promise<boolean>} A promise that resolves to `true` if the promise finished within the timeout, or `false` if it didn't.
 *
 * @example
 * ```typescript
 * const slowPromise = new Promise((resolve) => setTimeout(() => resolve('done'), 2000))
 * const isFinished = await isPromiseFinished(slowPromise, 1000)
 * console.log(isFinished) // false (promise takes 2s, timeout is 1s)
 *
 * const fastPromise = Promise.resolve('done')
 * const isFinished2 = await isPromiseFinished(fastPromise, 1000)
 * console.log(isFinished2) // true (promise resolves immediately)
 * ```
 */
export const isPromiseFinished = <T>(
  promise: Promise<T>,
  timeout: number = 1000,
): Promise<boolean> =>
  Promise.race<boolean>([
    new Promise<boolean>((done) => setTimeout(() => done(false), timeout)),
    promise.then(() => true).catch(() => true),
  ])
