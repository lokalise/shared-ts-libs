import { setTimeout } from 'node:timers/promises'
import { isSerializationFailure } from '../errors/index.ts'
import { calculateRetryDelay } from './calculateRetryDelay.ts'
import type { RetryOnSerializationFailureOptions } from './types.ts'

const DEFAULT_OPTIONS = {
  retriesAllowed: 2, // first try + 2 retries = 3 tries
  baseRetryDelayMs: 100,
  maxRetryDelayMs: 30000, // 30s
} satisfies Required<RetryOnSerializationFailureOptions>

/**
 * Run a single statement, retrying it with exponential backoff while it fails with a
 * serialization failure. Any other error is rethrown immediately, and the last serialization
 * failure is rethrown once the retries are exhausted.
 *
 * Use this instead of {@link prismaTransaction} when the statement is a single read: wrapping one
 * statement in an explicit transaction costs a BEGIN/COMMIT round trip and takes away
 * CockroachDB's own ability to refresh and retry the implicit single-statement transaction
 * server-side, which it can no longer do once the client has opened the transaction.
 *
 * Only safe around a single read-only statement. A write, or a statement that runs inside an
 * interactive transaction, has to be retried at the transaction boundary instead - replaying it
 * alone would either duplicate its effects or re-run it against an aborted transaction.
 *
 * @param {() => Promise<T>} query function issuing the statement, called once per attempt
 * @param {RetryOnSerializationFailureOptions} options retry configuration
 * @return {Promise<T>}
 */
export const retryOnSerializationFailure = async <T>(
  query: () => Promise<T>,
  options?: RetryOnSerializationFailureOptions,
): Promise<T> => {
  // resolved per option, as spreading `options` would let an explicit `undefined` erase a default
  const retriesAllowed = options?.retriesAllowed ?? DEFAULT_OPTIONS.retriesAllowed
  const baseRetryDelayMs = options?.baseRetryDelayMs ?? DEFAULT_OPTIONS.baseRetryDelayMs
  const maxRetryDelayMs = options?.maxRetryDelayMs ?? DEFAULT_OPTIONS.maxRetryDelayMs

  for (let retries = 0; ; retries++) {
    try {
      return await query()
    } catch (error) {
      if (retries >= retriesAllowed || !isSerializationFailure(error)) throw error
      await setTimeout(calculateRetryDelay(retries + 1, baseRetryDelayMs, maxRetryDelayMs))
    }
  }
}
