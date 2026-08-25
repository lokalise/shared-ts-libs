/**
 * Transport-level failures without an HTTP response: undici timeouts/socket
 * errors and node connection errors. Typically temporary, so callers usually
 * want to retry them.
 */
const TRANSPORT_ERROR_CODES = new Set([
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
])

const MAX_CAUSE_DEPTH = 5

/**
 * Returns the transport-error code of the given error (or of an error in its
 * `cause` chain, e.g. when wrapped by InternalRequestError or fetch), or
 * undefined when the error is not a transport-level failure.
 */
export function getTransportErrorCode(error: unknown): string | undefined {
  let current: unknown = error
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth++) {
    if (typeof current !== 'object' || current === null) return undefined
    const code = (current as { code?: unknown }).code
    if (typeof code === 'string' && TRANSPORT_ERROR_CODES.has(code)) return code
    current = (current as { cause?: unknown }).cause
  }
  return undefined
}

/** True when the error is a transport-level request failure (no HTTP response was received). */
export function isTransportError(error: unknown): boolean {
  return getTransportErrorCode(error) !== undefined
}
