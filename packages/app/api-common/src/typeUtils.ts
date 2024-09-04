export type AutopilotError = {
  code: string
  message: string
}

export function isObject(maybeObject: unknown): maybeObject is Record<PropertyKey, unknown> {
  return typeof maybeObject === 'object' && maybeObject !== null
}

export function isAutopilotError(error: unknown): error is AutopilotError {
  return isObject(error) && typeof error.errorCode === 'string' && typeof error.message === 'string'
}
