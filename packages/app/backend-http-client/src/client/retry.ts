import { setTimeout as setTimeoutPromise } from 'node:timers/promises'
import type { Dispatcher } from 'undici'

const DEFAULT_MAX_RETRIES = 2
const DEFAULT_RETRYABLE_STATUS_CODES = [
  408, // Request Timeout
  425, // Too Early
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
] as const
const DEFAULT_DELAY = (retryNumber: number) => 100 * 2 ** (retryNumber - 1)
const DEFAULT_MAX_DELAY = 30_000
const DEFAULT_MAX_JITTER = 100

export type RetryConfig = {
  /**
  Maximum number of retries, not counting the initial attempt.

  @default 2
  */
  maxRetries?: number

  /**
  HTTP status codes that trigger a retry.

  @default [408, 425, 429, 500, 502, 503, 504]
  */
  statusCodes?: readonly number[]

  /**
   Function to calculate the delay in milliseconds between retries.
   Receives the retry number (1 = first retry, 2 = second, …).

   @default (n) => 100 * 2 ** (n - 1)
   */
  delay?: (retryNumber: number) => number

  /**
   Hard upper bound in milliseconds for any delay, including `Retry-After` values.

   @default 30_000
   */
  maxDelay?: number

  /**
  Maximum random jitter in milliseconds to add on top of any delay, including `Retry-After` values.
  Helps spread out retries when many clients fail simultaneously.

  @default 100
  */
  maxJitter?: number

  /**
  When `true`, honors `Retry-After` response headers instead of calling `delay()`.
  Set to `false` to always use `delay()`.

  @default true
  */
  respectRetryAfter?: boolean

  /**
  Whether to retry on network-level errors (e.g. `UND_ERR_SOCKET`).

  @default true
  */
  retryOnNetworkError?: boolean

  /**
  Whether to retry when a per-attempt timeout (set via `timeout` option) is exceeded.
  Has no effect when `timeout` is not set.

  @default false
  */
  retryOnTimeout?: boolean
}

type ResolvedRetryConfig = Required<RetryConfig>

export function resolveRetryConfig(config: RetryConfig | true): ResolvedRetryConfig {
  const resolved = config === true ? {} : config

  return {
    maxRetries: resolved.maxRetries ?? DEFAULT_MAX_RETRIES,
    statusCodes: resolved.statusCodes ?? DEFAULT_RETRYABLE_STATUS_CODES,
    delay: resolved.delay ?? DEFAULT_DELAY,
    maxDelay: resolved.maxDelay ?? DEFAULT_MAX_DELAY,
    maxJitter: resolved.maxJitter ?? DEFAULT_MAX_JITTER,
    respectRetryAfter: resolved.respectRetryAfter ?? true,
    retryOnNetworkError: resolved.retryOnNetworkError ?? true,
    retryOnTimeout: resolved.retryOnTimeout ?? false,
  }
}

/**
 * Parses the HTTP `Retry-After` header into a delay.
 *
 * Per RFC 9110:
 * - Supports either seconds or an HTTP-date
 * - Invalid values are treated as absent
 *
 * Returns delay in milliseconds, or `null` if missing or invalid.
 */
function parseRetryAfterHeader(headers: Dispatcher.ResponseData['headers']): number | null {
  const rawRetryAfter = headers['retry-after']

  const retryAfter = Array.isArray(rawRetryAfter) ? rawRetryAfter[0] : rawRetryAfter

  if (!retryAfter) {
    return null
  }

  const retrySeconds = Number(retryAfter)
  if (!Number.isNaN(retrySeconds)) {
    return !Number.isInteger(retrySeconds) || retrySeconds < 0 ? null : retrySeconds * 1000
  }

  const retryTime = new Date(retryAfter).getTime()
  if (!Number.isNaN(retryTime)) {
    const delta = retryTime - Date.now()
    return delta < 0 ? null : delta
  }

  return null
}

function withJitterAndCap(delay: number, config: ResolvedRetryConfig): number {
  return Math.min(delay + Math.random() * config.maxJitter, config.maxDelay)
}

function resolveRetryDelayMs(
  response: Dispatcher.ResponseData,
  retryNumber: number,
  config: ResolvedRetryConfig,
): number {
  if (config.respectRetryAfter) {
    const retryAfterMs = parseRetryAfterHeader(response.headers)

    if (retryAfterMs !== null) {
      return withJitterAndCap(retryAfterMs, config)
    }
  }

  return withJitterAndCap(config.delay(retryNumber), config)
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: it is acceptable
export async function executeWithRetry(
  fn: () => Promise<Dispatcher.ResponseData>,
  config: ResolvedRetryConfig,
  signal?: AbortSignal,
): Promise<Dispatcher.ResponseData> {
  let retryNumber = 0

  while (true) {
    retryNumber += 1
    const isLastAttempt = retryNumber >= config.maxRetries

    let response: Dispatcher.ResponseData
    try {
      response = await fn()
    } catch (err) {
      // handle NetworkError/Timeout/SignalAbort
      if (isLastAttempt || signal?.aborted) {
        throw err
      }

      const isTimeout =
        err !== null && typeof err === 'object' && 'name' in err && err.name === 'TimeoutError'

      if (isTimeout ? !config.retryOnTimeout : !config.retryOnNetworkError) {
        throw err
      }

      const delay = withJitterAndCap(config.delay(retryNumber), config)
      if (delay > 0) {
        await setTimeoutPromise(delay, undefined, { signal })
      }

      continue
    }

    // handle response
    if (!isLastAttempt && config.statusCodes.includes(response.statusCode)) {
      const delay = resolveRetryDelayMs(response, retryNumber, config)

      // undici response body always has to be processed or discarded
      await response.body.dump()

      if (delay > 0) {
        await setTimeoutPromise(delay, undefined, { signal })
      }

      continue
    }

    // return success response or last error response
    return response
  }
}
