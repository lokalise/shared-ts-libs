type ObjectValues<T> = T[keyof T]

/**
 * Protocol-agnostic error type categorization.
 *
 * Error types are not coupled to any specific protocol and can be mapped to
 * HTTP status codes, gRPC status, message queue error codes, etc.
 */
export const ErrorType = {
  /** Invalid request or validation error */
  BAD_REQUEST: 'bad-request',
  /** Authentication required or failed */
  UNAUTHENTICATED: 'unauthenticated',
  /** Insufficient permissions */
  PERMISSION_DENIED: 'permission-denied',
  /** Resource not found */
  NOT_FOUND: 'not-found',
  /** Resource conflict or already exists */
  CONFLICT: 'conflict',
  /** Rate limit exceeded */
  RATE_LIMIT: 'rate-limit',
  /** Internal server error */
  INTERNAL: 'internal',
  /** Not implemented */
  UNIMPLEMENTED: 'unimplemented',
  /** Service unavailable */
  UNAVAILABLE: 'unavailable',
} as const
export type ErrorType = ObjectValues<typeof ErrorType>

/** Maps every {@link ErrorType} to an HTTP status code. */
export const httpStatusByErrorType = {
  [ErrorType.BAD_REQUEST]: 400,
  [ErrorType.UNAUTHENTICATED]: 401,
  [ErrorType.PERMISSION_DENIED]: 403,
  [ErrorType.NOT_FOUND]: 404,
  [ErrorType.CONFLICT]: 409,
  [ErrorType.RATE_LIMIT]: 429,
  [ErrorType.INTERNAL]: 500,
  [ErrorType.UNIMPLEMENTED]: 501,
  [ErrorType.UNAVAILABLE]: 503,
} as const satisfies Record<ErrorType, number>
