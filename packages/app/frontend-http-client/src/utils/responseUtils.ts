/**
 * Flatten a `Response`'s headers into a plain object with lowercase keys, the
 * shape both the contract client and the fallback transport hand to callers.
 */
export function normalizeResponseHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {}

  response.headers.forEach((value, key) => {
    headers[key] = value
  })

  return headers
}
