export const waitAndRetry = async <T>(
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
