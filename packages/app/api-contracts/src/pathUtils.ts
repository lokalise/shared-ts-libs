/**
 * Builds a request path by combining a base path with an optional path prefix.
 * Ensures proper slash handling to avoid double slashes or missing slashes.
 *
 * @param path - The base path for the request
 * @param pathPrefix - Optional prefix to prepend to the path
 * @returns The combined path with proper slash formatting
 *
 * @example
 * ```typescript
 * buildRequestPath('/api/users') // '/api/users'
 * buildRequestPath('api/users') // '/api/users'
 * buildRequestPath('/api/users', 'v1') // '/v1/api/users'
 * buildRequestPath('/api/users', '/v1/') // '/v1/api/users'
 * buildRequestPath('api/users', 'v1') // '/v1/api/users'
 * ```
 */
export function buildRequestPath(path: string, pathPrefix?: string): string {
  if (!pathPrefix) {
    return ensureStartsWithSlash(path)
  }

  // Remove trailing slash from pathPrefix and leading slash from path
  const cleanPrefix = pathPrefix.replace(/\/$/, '')
  const cleanPath = path.replace(/^\//, '')

  return ensureStartsWithSlash(`${cleanPrefix}/${cleanPath}`)
}

function ensureStartsWithSlash(str: string): string {
  return str.startsWith('/') ? str : `/${str}`
}
