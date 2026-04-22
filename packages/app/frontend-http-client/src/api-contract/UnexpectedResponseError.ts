const unexpectedResponseErrorBrand = Symbol.for(
  'lokalise.frontend-http-client.error.UnexpectedResponseError',
)

export class UnexpectedResponseError extends Error {
  readonly code = 'UNEXPECTED_RESPONSE_ERROR'
  readonly statusCode: number
  readonly headers: Record<string, string | undefined>
  readonly body: string

  constructor(statusCode: number, headers: Record<string, string | undefined>, body: string) {
    super(
      `Unexpected response: statusCode=${statusCode}, contentType=${headers['content-type'] ?? 'none'}`,
    )
    this.name = 'UnexpectedResponseError'
    this.statusCode = statusCode
    this.headers = headers
    this.body = body

    Object.defineProperty(this, unexpectedResponseErrorBrand, { value: true })
  }

  static override [Symbol.hasInstance](val: unknown): boolean {
    return (
      val !== null &&
      typeof val === 'object' &&
      unexpectedResponseErrorBrand in val &&
      val[unexpectedResponseErrorBrand] === true
    )
  }
}
