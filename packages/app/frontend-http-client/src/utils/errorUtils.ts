import type { WretchResponse } from 'wretch'
import { WretchError } from 'wretch/resolver'

export function buildWretchError(message: string, response: WretchResponse): WretchError {
  const error = new WretchError(message)
  error.response = response
  error.status = response.status
  error.url = response.url

  return error
}

/** Checked by shape: a client from another wretch copy, or its CommonJS build, has its own WretchError class. */
export function isWretchError(error: unknown): error is WretchError {
  return error instanceof Error && 'response' in error && 'status' in error && 'url' in error
}

export class XmlHttpRequestError extends Error {
  readonly details?: Record<string, unknown>

  constructor(message: string, details?: Record<string, unknown>) {
    super(message)

    this.details = details
  }
}
