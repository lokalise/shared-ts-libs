export const calculateRetryDelay = (
  retries: number,
  baseRetryDelayMs: number,
  maxDelayMs: number,
): number => {
  // exponential backoff -> 2^(retry-1) * baseRetryDelayMs
  const expDelay = Math.pow(2, retries - 1) * baseRetryDelayMs
  return Math.min(expDelay, maxDelayMs)
}
