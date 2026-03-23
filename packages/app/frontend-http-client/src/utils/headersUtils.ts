import type { HeadersObject, HeadersSource } from '../types.ts'

export function resolveHeaders(headers: HeadersSource): HeadersObject | Promise<HeadersObject> {
  return (typeof headers === 'function' ? headers() : headers) ?? {}
}
