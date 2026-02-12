import { PublicNonRecoverableError } from '@lokalise/node-core'

export type FilterErrorParams = {
  message: string
  details?: Record<string, unknown>
}

export class FilterNotSupportedError extends PublicNonRecoverableError {
  constructor(params: FilterErrorParams) {
    super({
      message: params.message,
      errorCode: 'FILTER_NOT_SUPPORTED',
      httpStatusCode: 400,
      details: params.details,
    })
  }
}

export function isFilterNotSupportedError(error: unknown): error is FilterNotSupportedError {
  return error instanceof FilterNotSupportedError
}
