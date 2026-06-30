const unexpectedResponseErrorBrand = Symbol.for(
  'lokalise.backend-http-client.error.UnexpectedResponseError',
)

export class UnexpectedResponseError extends Error {
  readonly code = 'UNEXPECTED_RESPONSE_ERROR'
  readonly statusCode: number
  readonly headers: Record<string, string | undefined>
  readonly body: string
  /** Contract `summary`, surfaced here for debugging unexpected responses. */
  readonly summary: string

  constructor(
    statusCode: number,
    headers: Record<string, string | undefined>,
    body: string,
    summary: string,
  ) {
    super(
      `Unexpected response for "${summary}": statusCode=${statusCode}, contentType=${headers['content-type'] ?? 'none'}`,
    )
    this.name = 'UnexpectedResponseError'
    this.statusCode = statusCode
    this.headers = headers
    this.body = body
    this.summary = summary

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
