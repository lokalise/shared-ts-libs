import type { WretchResponse } from 'wretch'
import { WretchError } from 'wretch/resolver'

export function buildWretchError(message: string, response: WretchResponse): WretchError {
  const error = new WretchError(message)
  error.response = response
  error.status = response.status
  error.url = response.url

  return error
}

/** Checked by shape, not class: another wretch copy or its CommonJS build has its own WretchError. */
export function isWretchErrorForResponse(error: unknown, response: Response): error is WretchError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    'url' in error &&
    'status' in error &&
    error.status === response.status
  )
}

export class XmlHttpRequestError extends Error {
  readonly details?: Record<string, unknown>

  constructor(message: string, details?: Record<string, unknown>) {
    super(message)

    this.details = details
  }
}
