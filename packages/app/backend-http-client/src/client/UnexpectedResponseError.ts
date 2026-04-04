const UNEXPECTED_RESPONSE_ERROR_BRAND = Symbol.for(
  'lokalise.backend-http-client.error.UnexpectedResponseError',
)

export class UnexpectedResponseError extends Error {
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

    Object.defineProperty(this, UNEXPECTED_RESPONSE_ERROR_BRAND, { value: true })
  }

  static override [Symbol.hasInstance](val: unknown): boolean {
    return (
      val !== null &&
      typeof val === 'object' &&
      UNEXPECTED_RESPONSE_ERROR_BRAND in val &&
      val[UNEXPECTED_RESPONSE_ERROR_BRAND] === true
    )
  }
}
