/**
 * Asynchronously retries a predicate function until it returns a truthy value or the maximum number of retries is
 * reached.
 *
 * @template T - The return type of the `predicateFn` and the resolved result of the promise.
 * @param {() => T} predicateFn - The function to execute and evaluate. It should return a truthy value when the desired condition is met.
 * @param {number} [sleepTime=20] - The amount of time to wait between retries, in milliseconds.
 * @param {number} [maxRetryCount=15] - The maximum number of retries allowed. Set to `0` for unlimited retries.
 * @returns {Promise<T>} A promise that resolves with the result of `predicateFn` when a truthy value is returned or the maximum retry count is exceeded.
 *
 * @example
 * ```typescript
 * const conditionMet = () => Math.random() > 0.9
 * waitAndRetry(conditionMet, 50, 10)
 *   .then((result) => { console.log('Condition met:', result) })
 *   .catch((error) => { console.error('An error occurred:', error) })
 * ```
 */

export const waitAndRetry = <T>(
  predicateFn: () => T,
  sleepTime = 20,
  maxRetryCount = 15,
): Promise<T> => {
  return new Promise((resolve, reject) => {
    let retryCount = 0

    const performCheck = () => {
      // amount of retries exceeded
      if (maxRetryCount !== 0 && retryCount > maxRetryCount) {
        resolve(predicateFn())
        return
      }

      // Try executing predicateFn
      Promise.resolve()
        .then(() => predicateFn())
        .then((result) => {
          if (result) {
            resolve(result)
            return
          }

          retryCount++
          setTimeout(performCheck, sleepTime)
        })
        .catch((err) => reject(err))
    }

    performCheck()
  })
}
