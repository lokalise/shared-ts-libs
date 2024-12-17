export const isError = (maybeError: unknown): maybeError is Error =>
  maybeError instanceof Error || Object.prototype.toString.call(maybeError) === '[object Error]'
