import { setTimeout as setTimeoutPromise } from 'node:timers/promises'
import type { Dispatcher } from 'undici'

export type RetryConfig = {
  /**
   * Maximum number of retries after the initial attempt.
   * For example, `maxRetries: 2` allows up to 3 total calls.
   *
   * @default 2
   */
  maxRetries?: number

  /**
   * HTTP status codes that trigger a retry.
   * Responses with codes not in this list are returned immediately.
   *
   * @default [408, 425, 429, 500, 502, 503, 504]
   */
  statusCodes?: readonly number[]

  /**
   * Calculates the delay in milliseconds before the next retry.
   * Receives the retry number (1 = first retry, 2 = second, …).
   * The result is capped by `maxDelay` and has jitter added via `maxJitter`.
   *
   * @default (n) => 100 * 2 ** (n - 1) — exponential backoff: 100 ms, 200 ms, 400 ms, …
   */
  delay?: (retryNumber: number) => number

  /**
   * Hard upper bound in milliseconds for any delay, including `Retry-After` values.
   *
   * @default 30_000
   */
  maxDelay?: number

  /**
   * Maximum random jitter in milliseconds added on top of the computed delay,
   * including `Retry-After` values. Spreads retries across clients to avoid
   * a thundering herd after a shared outage.
   *
   * @default 100
   */
  maxJitter?: number

  /**
   * When `true`, uses the `Retry-After` response header as the delay instead of `delay()`.
   * Falls back to `delay()` when the header is absent or unparseable.
   * Set to `false` to always use `delay()`.
   *
   * @default true
   */
  respectRetryAfter?: boolean

  /**
   * When `true`, retries on network-level errors such as `UND_ERR_SOCKET`.
   *
   * @default true
   */
  retryOnNetworkError?: boolean

  /**
   * When `true`, retries when a per-attempt timeout expires (set via the `timeout` option).
   * Has no effect when `timeout` is not configured.
   *
   * @default true
   */
  retryOnTimeout?: boolean
}

const defaultRetryConfig: Required<RetryConfig> = {
  maxRetries: 2,
  statusCodes: [
    408, // Request Timeout
    425, // Too Early
    429, // Too Many Requests
    500, // Internal Server Error
    502, // Bad Gateway
    503, // Service Unavailable
    504, // Gateway Timeout
  ],
  delay: (retryNumber: number) => 100 * 2 ** (retryNumber - 1),
  maxDelay: 30_000,
  maxJitter: 100,
  respectRetryAfter: true,
  retryOnNetworkError: true,
  retryOnTimeout: true,
}

type ResolvedRetryConfig = Required<RetryConfig>

/**
 * Resolves a {@link RetryConfig} (or the `true` shorthand) into a fully-populated config
 * with all defaults applied.
 */
export function resolveRetryConfig(config: RetryConfig | true): ResolvedRetryConfig {
  if (config === true) {
    return defaultRetryConfig
  }

  // Strip undefined fields so they don't override defaults when spread below.
  // TypeScript optional fields can be explicitly set to undefined (e.g. { maxRetries: undefined }),
  // which would otherwise shadow the default value in { ...defaultRetryConfig, ...config }.
  const definedConfig = Object.fromEntries(
    Object.entries(config).filter(([, v]) => v !== undefined),
  )

  return { ...defaultRetryConfig, ...definedConfig }
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
export function parseRetryAfterHeader(headers: Dispatcher.ResponseData['headers']): number | null {
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

/**
 * Adds a random jitter up to `maxJitter` ms to `delay`, then clamps the result to `maxDelay`.
 */
function applyJitterAndCap(delay: number, config: ResolvedRetryConfig): number {
  return Math.min(delay + Math.random() * config.maxJitter, config.maxDelay)
}

function computeRetryDelay(
  response: Dispatcher.ResponseData,
  retryNumber: number,
  config: ResolvedRetryConfig,
): number {
  if (config.respectRetryAfter) {
    const retryAfterMs = parseRetryAfterHeader(response.headers)

    if (retryAfterMs !== null) {
      return applyJitterAndCap(retryAfterMs, config)
    }
  }

  return applyJitterAndCap(config.delay(retryNumber), config)
}

/**
 * Executes `fn` repeatedly until it resolves with a non-retryable response,
 * throws a non-retryable error, or exhausts all retries.
 *
 * Retries on:
 * - HTTP status codes listed in `config.statusCodes`
 * - Network errors (e.g. `UND_ERR_SOCKET`) when `config.retryOnNetworkError` is `true`
 * - Per-attempt timeouts when `config.retryOnTimeout` is `true`
 *
 * The optional `signal` is forwarded to inter-retry sleeps, so aborting it
 * cancels both the in-flight request and any pending wait between attempts.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: it is acceptable
export async function withRetry(
  fn: () => Promise<Dispatcher.ResponseData>,
  config: ResolvedRetryConfig,
  signal?: AbortSignal,
): Promise<Dispatcher.ResponseData> {
  let retryNumber = 0

  while (true) {
    const isLastAttempt = retryNumber >= config.maxRetries
    retryNumber += 1

    let response: Dispatcher.ResponseData
    try {
      response = await fn()
    } catch (err) {
      // Re-throw immediately when retries are exhausted or the caller has aborted.
      if (isLastAttempt || signal?.aborted) {
        throw err
      }

      // AbortSignal.timeout() throws a DOMException named 'TimeoutError', which is
      // distinct from a manual signal.abort() which throws an 'AbortError'.
      const isTimeout =
        err !== null && typeof err === 'object' && 'name' in err && err.name === 'TimeoutError'

      if (isTimeout ? !config.retryOnTimeout : !config.retryOnNetworkError) {
        throw err
      }

      const delay = applyJitterAndCap(config.delay(retryNumber), config)
      if (delay > 0) {
        await setTimeoutPromise(delay, undefined, { signal })
      }

      continue
    }

    // Retryable status code — consume the body and wait before the next attempt.
    if (!isLastAttempt && config.statusCodes.includes(response.statusCode)) {
      const delay = computeRetryDelay(response, retryNumber, config)

      // undici response body must always be consumed or explicitly dumped.
      await response.body.dump()

      if (delay > 0) {
        await setTimeoutPromise(delay, undefined, { signal })
      }

      continue
    }

    return response
  }
}
