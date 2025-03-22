import type { WretchResponse } from 'wretch'
import { WretchError } from 'wretch/resolver'

export function buildWretchError(message: string, response: WretchResponse): WretchError {
  const error = new WretchError(message)
  error.response = response
  error.status = response.status
  error.url = response.url

  return error
}

export class XmlHttpRequestError extends Error {
  readonly details?: Record<string, unknown>

  constructor(message: string, details?: Record<string, unknown>) {
    super(message)

    this.details = details
  }
}
