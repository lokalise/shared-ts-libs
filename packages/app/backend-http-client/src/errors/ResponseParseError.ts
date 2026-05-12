const responseParseErrorBrand = Symbol.for('lokalise.backend-http-client.error.ResponseParseError')

export class ResponseParseError extends Error {
  readonly errorCode: string
  readonly details: { rawBody: string; requestLabel?: string }

  constructor(params: {
    message: string
    errorCode: string
    rawBody: string
    requestLabel?: string
  }) {
    super(params.message)
    this.name = 'ResponseParseError'
    this.errorCode = params.errorCode
    this.details = { rawBody: params.rawBody, requestLabel: params.requestLabel }

    Object.defineProperty(this, responseParseErrorBrand, { value: true })
  }

  static override [Symbol.hasInstance](val: unknown): boolean {
    return (
      val !== null &&
      typeof val === 'object' &&
      responseParseErrorBrand in val &&
      (val as Record<symbol, unknown>)[responseParseErrorBrand] === true
    )
  }
}
