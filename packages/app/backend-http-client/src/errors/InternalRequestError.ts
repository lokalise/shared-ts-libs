const internalRequestErrorBrand = Symbol.for(
  'lokalise.backend-http-client.error.InternalRequestError',
)

export class InternalRequestError extends Error {
  readonly requestLabel?: string

  constructor(cause: unknown, requestLabel?: string) {
    super(cause instanceof Error ? cause.message : 'Request error', { cause })
    this.name = 'InternalRequestError'
    this.requestLabel = requestLabel

    Object.defineProperty(this, internalRequestErrorBrand, { value: true })
  }

  static override [Symbol.hasInstance](val: unknown): boolean {
    return (
      val !== null &&
      typeof val === 'object' &&
      internalRequestErrorBrand in val &&
      (val as Record<symbol, unknown>)[internalRequestErrorBrand] === true
    )
  }
}

export function isInternalRequestError(error: unknown): error is InternalRequestError {
  return error instanceof InternalRequestError
}
