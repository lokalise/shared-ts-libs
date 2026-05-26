/** Tuple of all 1xx informational HTTP status codes. */
export const INFORMATIONAL_HTTP_STATUS_CODES = [100, 101, 102, 103] as const
/** Union of all 1xx informational HTTP status codes. */
export type InformationalHttpStatusCode = (typeof INFORMATIONAL_HTTP_STATUS_CODES)[number]

/** Tuple of all 2xx successful HTTP status codes. */
export const SUCCESSFUL_HTTP_STATUS_CODES = [
  200, 201, 202, 203, 204, 205, 206, 207, 208, 226,
] as const
/** Union of all 2xx successful HTTP status codes. */
export type SuccessfulHttpStatusCode = (typeof SUCCESSFUL_HTTP_STATUS_CODES)[number]

/** Tuple of all 3xx redirection HTTP status codes. */
export const REDIRECTION_HTTP_STATUS_CODES = [300, 301, 302, 303, 304, 305, 306, 307, 308] as const
/** Union of all 3xx redirection HTTP status codes. */
export type RedirectionHttpStatusCode = (typeof REDIRECTION_HTTP_STATUS_CODES)[number]

/** Tuple of all 4xx client-error HTTP status codes. */
export const CLIENT_ERROR_HTTP_STATUS_CODES = [
  400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418,
  421, 422, 423, 424, 425, 426, 428, 429, 431, 451,
] as const
/** Union of all 4xx client-error HTTP status codes. */
export type ClientErrorHttpStatusCode = (typeof CLIENT_ERROR_HTTP_STATUS_CODES)[number]

/** Tuple of all 5xx server-error HTTP status codes. */
export const SERVER_ERROR_HTTP_STATUS_CODES = [
  500, 501, 502, 503, 504, 505, 506, 507, 508, 510, 511,
] as const
/** Union of all 5xx server-error HTTP status codes. */
export type ServerErrorHttpStatusCode = (typeof SERVER_ERROR_HTTP_STATUS_CODES)[number]

/** Union of every standard HTTP status code across all classes (1xx–5xx). */
export type HttpStatusCode =
  | InformationalHttpStatusCode
  | SuccessfulHttpStatusCode
  | RedirectionHttpStatusCode
  | ClientErrorHttpStatusCode
  | ServerErrorHttpStatusCode

/** String representation of an HTTP status class. */
export type HttpStatusCodeRange = '1xx' | '2xx' | '3xx' | '4xx' | '5xx'

/** Range key or catch-all fallback. */
export type WildcardStatusCodeKey = HttpStatusCodeRange | 'default'

type RangeExpansion = {
  '1xx': InformationalHttpStatusCode
  '2xx': SuccessfulHttpStatusCode
  '3xx': RedirectionHttpStatusCode
  '4xx': ClientErrorHttpStatusCode
  '5xx': ServerErrorHttpStatusCode
  default: HttpStatusCode
}

/**
 * Maps a `WildcardStatusCodeKey` to its concrete `HttpStatusCode` union.
 * `'default'` expands to the full `HttpStatusCode` union.
 */
export type ExpandStatusRangeKey<K extends WildcardStatusCodeKey> = RangeExpansion[K]
