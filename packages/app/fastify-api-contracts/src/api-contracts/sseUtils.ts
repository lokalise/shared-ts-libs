import type { SSEReplyInterface } from '@fastify/sse'
import type { FastifyReply } from 'fastify'
import type { DualModeType } from './sseTypes.ts'

/**
 * `FastifyReply` extended with the SSE capabilities provided by `@fastify/sse`.
 */
export type SSEReply = FastifyReply & { sse: SSEReplyInterface }

/**
 * Check if a value is an Error-like object (cross-realm safe).
 * Uses duck typing instead of `instanceof` for reliability across realms.
 */
export function isErrorLike(err: unknown): err is { message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string'
  )
}

/**
 * Check if an error has a valid `httpStatusCode` property (like `PublicNonRecoverableError`).
 * Uses duck typing instead of `instanceof` for reliability across realms.
 * Validates the status code is a finite integer within the valid HTTP range (100-599).
 */
export function hasHttpStatusCode(err: unknown): err is { httpStatusCode: number } {
  if (typeof err !== 'object' || err === null || !('httpStatusCode' in err)) {
    return false
  }
  const statusCode = (err as { httpStatusCode: unknown }).httpStatusCode
  return (
    typeof statusCode === 'number' &&
    Number.isFinite(statusCode) &&
    Number.isInteger(statusCode) &&
    statusCode >= 100 &&
    statusCode <= 599
  )
}

/**
 * Determine the response mode from the `Accept` header for dual-mode routes.
 *
 * Parses the `Accept` header and determines whether to use JSON or SSE mode.
 * Supports quality values (`q=`) for content negotiation.
 *
 * @param accept - The `Accept` header value
 * @param defaultMode - Mode to use when no preference is specified
 * @returns The determined response mode
 */
export function determineMode(
  accept: string | undefined,
  defaultMode: DualModeType = 'json',
): DualModeType {
  if (!accept) return defaultMode

  // Split by comma and parse each media type with its quality value
  const mediaTypes = accept
    .split(',')
    .map((part) => {
      const [mediaType, ...params] = part.trim().split(';')
      let quality = 1.0

      for (const param of params) {
        const [key, value] = param.trim().split('=')
        if (key === 'q' && value) {
          quality = Number.parseFloat(value)
        }
      }

      return { mediaType: (mediaType ?? '').trim().toLowerCase(), quality }
    })
    // Filter out rejected types (quality <= 0)
    .filter((entry) => entry.quality > 0)

  // Sort by quality (highest first)
  mediaTypes.sort((a, b) => b.quality - a.quality)

  // Find the first matching type
  for (const { mediaType } of mediaTypes) {
    if (mediaType === 'text/event-stream') {
      return 'sse'
    }
    if (mediaType === 'application/json') {
      return 'json'
    }
  }

  // If */* is present, fall back to the default mode
  return defaultMode
}
