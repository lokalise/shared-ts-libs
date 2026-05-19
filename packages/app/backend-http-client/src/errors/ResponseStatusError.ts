import { InternalError } from '@lokalise/node-core'
import type { RequestResult } from '../client/types.ts'

export function isResponseStatusError(entity: unknown): entity is ResponseStatusError {
  return 'isResponseStatusError' in (entity as ResponseStatusError)
}

export class ResponseStatusError extends InternalError {
  public readonly response: RequestResult<unknown>
  public readonly isResponseStatusError = true

  constructor(requestResult: RequestResult<unknown>, requestLabel = 'N/A') {
    super({
      message: `Response status code ${requestResult.statusCode}`,
      details: {
        requestLabel,
        response: {
          statusCode: requestResult.statusCode,
          body: requestResult.body,
        },
      },
      errorCode: 'REQUEST_ERROR',
    })
    this.response = requestResult
    this.name = 'ResponseStatusError'
  }
}
