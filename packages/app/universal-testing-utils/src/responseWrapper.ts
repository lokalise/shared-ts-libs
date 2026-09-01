const RESPONSE_BRAND = Symbol('MockResponseWrapper')

export type MockResponseWrapper<T> = {
  readonly [RESPONSE_BRAND]: true
  readonly body: T
  readonly status?: number
}

/**
 * Wraps a mock response body so a per-call status code travels with it.
 *
 * Handlers may return a bare body instead, in which case the status falls back to the one
 * declared on the mock.
 */
export function wrapMockResponse<T>(
  body: T,
  options?: { status?: number },
): MockResponseWrapper<T> {
  return { [RESPONSE_BRAND]: true, body, status: options?.status }
}

export function unwrapMockResponse(result: unknown): { body: unknown; status?: number } {
  if (result && typeof result === 'object' && RESPONSE_BRAND in result) {
    const wrapper = result as MockResponseWrapper<unknown>
    return { body: wrapper.body, status: wrapper.status }
  }

  return { body: result }
}
