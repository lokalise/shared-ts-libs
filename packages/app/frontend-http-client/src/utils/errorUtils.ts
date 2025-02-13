import type { WretchResponse } from 'wretch'
import { WretchError } from 'wretch/resolver'

export function buildWretchError(message: string, response: WretchResponse): WretchError {
  const error = new WretchError(message)
  error.response = response
  error.status = response.status
  error.url = response.url

  return error
}
