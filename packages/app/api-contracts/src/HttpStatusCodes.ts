export const INFORMATIONAL_HTTP_STATUS_CODES = [100, 101, 102, 103] as const
export type InformationalHttpStatusCode = (typeof INFORMATIONAL_HTTP_STATUS_CODES)[number]

export const SUCCESSFUL_HTTP_STATUS_CODES = [
  200, 201, 202, 203, 204, 205, 206, 207, 208, 226,
] as const
export type SuccessfulHttpStatusCode = (typeof SUCCESSFUL_HTTP_STATUS_CODES)[number]

export const REDIRECTION_HTTP_STATUS_CODES = [300, 301, 302, 303, 304, 305, 306, 307, 308] as const
export type RedirectionHttpStatusCode = (typeof REDIRECTION_HTTP_STATUS_CODES)[number]

export const CLIENT_ERROR_HTTP_STATUS_CODES = [
  400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418,
  421, 422, 423, 424, 425, 426, 428, 429, 431, 451,
] as const
export type ClientErrorHttpStatusCode = (typeof CLIENT_ERROR_HTTP_STATUS_CODES)[number]

export const SERVER_ERROR_HTTP_STATUS_CODES = [
  500, 501, 502, 503, 504, 505, 506, 507, 508, 510, 511,
] as const
export type ServerErrorHttpStatusCode = (typeof SERVER_ERROR_HTTP_STATUS_CODES)[number]

export type HttpStatusCode =
  | InformationalHttpStatusCode
  | SuccessfulHttpStatusCode
  | RedirectionHttpStatusCode
  | ClientErrorHttpStatusCode
  | ServerErrorHttpStatusCode

export type HttpStatusCodeRange = '1xx' | '2xx' | '3xx' | '4xx' | '5xx'

export type WildcardStatusCodeKey = HttpStatusCodeRange | 'default'

export type ExpandStatusRangeKey<K extends WildcardStatusCodeKey> = K extends '1xx'
  ? InformationalHttpStatusCode
  : K extends '2xx'
    ? SuccessfulHttpStatusCode
    : K extends '3xx'
      ? RedirectionHttpStatusCode
      : K extends '4xx'
        ? ClientErrorHttpStatusCode
        : K extends '5xx'
          ? ServerErrorHttpStatusCode
          : HttpStatusCode // 'default'
