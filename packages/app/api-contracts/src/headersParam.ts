/**
 * Request headers as accepted by every contract client: a plain object, or a sync or async
 * factory producing one. Factories run once per request, so a refreshed token reaches a retry.
 */
export type HeadersParam<T> = T | (() => T) | (() => Promise<T>)

/** Resolves a {@link HeadersParam}: invokes a factory, passes an object through. */
export const resolveHeadersParam = <T>(headers: HeadersParam<T>): T | Promise<T> =>
  typeof headers === 'function' ? (headers as () => T | Promise<T>)() : headers
